"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAuth, requireAdmin } from "@/lib/auth"
import { createBookingSchema, updateBookingStatusSchema } from "@/lib/validations"
import { isCarAvailable, calculateTotalDays } from "@/lib/availability"
import { stripe } from "@/lib/stripe"
import { config } from "@/lib/config"
import { sendManualPaymentEmail, sendAdminBookingNotification } from "@/lib/email"
import crypto from "crypto"
import { Prisma } from "@prisma/client"

export async function createBooking(data: unknown) {
  try {
    const user = await requireAuth()

    // Validate input
    const validated = createBookingSchema.parse(data)

    const pickupDate = new Date(validated.pickupDate)
    const dropoffDate = new Date(validated.dropoffDate)

    // Check car exists
    const car = await prisma.car.findUnique({
      where: { id: validated.carId },
    })

    if (!car || car.isDeleted) {
      return { error: "Car not found" }
    }

    if (car.status === "RENTED" || car.status === "MAINTENANCE") {
      return { error: "Car is not available for booking" }
    }

    // Check availability with a transaction lock to prevent race conditions
    const available = await isCarAvailable(validated.carId, pickupDate, dropoffDate)

    if (!available) {
      return { error: "Car is not available for the selected dates" }
    }

    // Calculate pricing
    const totalDays = calculateTotalDays(pickupDate, dropoffDate)
    const totalPrice = car.price * totalDays
    const depositAmount = Math.round(totalPrice * 0.2) // 20% deposit

    // Generate unique booking number and transfer code
    const bookingNumber = `BK${Date.now().toString().slice(-8)}`
    const transferCode = crypto.randomBytes(4).toString("hex").toUpperCase()

    // Create booking in transaction
    const booking = await prisma.$transaction(
      async (tx) => {
        // Lock the car row to prevent concurrent bookings
        await tx.$queryRaw`SELECT id FROM "Car" WHERE id = ${validated.carId} FOR UPDATE`

        // Double-check availability within transaction
        const stillAvailable = await isCarAvailable(validated.carId, pickupDate, dropoffDate, undefined, tx)

        if (!stillAvailable) {
          throw new Error("Car is no longer available")
        }

        // Create booking
        const newBooking = await tx.booking.create({
          data: {
            userId: user.id,
            carId: validated.carId,
            pickupDate,
            dropoffDate,
            location: validated.location,
            pricePerDay: car.price,
            totalDays,
            totalPrice,
            depositAmount,
            transferCode,
            bookingNumber,
            status: "PENDING",
            paymentStatus: "PENDING",
          },
        })

        return newBooking
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    )

    // If Stripe is enabled, create checkout session
    if (stripe && config.features.paymentsEnabled) {
      const stripeImages = car.image.startsWith("http") ? [car.image] : []
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: `${car.name} Rental`,
                description: `${totalDays} day(s) - ${validated.location}`,
                ...(stripeImages.length > 0 ? { images: stripeImages } : {}),
              },
              unit_amount: totalPrice,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${config.appUrl}/bookings?success=true&booking_id=${booking.id}`,
        cancel_url: `${config.appUrl}/cars/${car.id}?cancelled=true`,
        metadata: {
          bookingId: booking.id,
          userId: user.id,
          carId: car.id,
        },
        customer_email: user.email,
      })

      // Update booking with Stripe session ID
      await prisma.booking.update({
        where: { id: booking.id },
        data: { stripeSessionId: session.id },
      })

      revalidatePath("/bookings")
      revalidatePath(`/cars/${car.id}`)

      return {
        success: true,
        booking,
        checkoutUrl: session.url,
        manualPayment: false,
      }
    }

    // Manual payment flow (no Stripe)
    // Send email notifications
    const formatDateForEmail = (date: Date) => {
      return new Date(date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    }

    // Send payment instructions to user
    if (config.features.emailEnabled) {
      await sendManualPaymentEmail({
        to: user.email,
        userName: user.name || user.email,
        carName: car.name,
        pickupDate: formatDateForEmail(booking.pickupDate),
        dropoffDate: formatDateForEmail(booking.dropoffDate),
        location: booking.location,
        totalPrice: booking.totalPrice,
        depositAmount: booking.depositAmount,
        transferCode: booking.transferCode,
        bookingNumber: booking.bookingNumber,
      })

      // Send notification to admin
      await sendAdminBookingNotification({
        adminEmail: config.adminEmails[0], // Send to first admin email
        userName: user.name || user.email,
        userEmail: user.email,
        carName: car.name,
        pickupDate: formatDateForEmail(booking.pickupDate),
        dropoffDate: formatDateForEmail(booking.dropoffDate),
        location: booking.location,
        totalPrice: booking.totalPrice,
        depositAmount: booking.depositAmount,
        transferCode: booking.transferCode,
        bookingNumber: booking.bookingNumber,
        bookingId: booking.id,
      })
    }

    revalidatePath("/bookings")
    revalidatePath(`/cars/${car.id}`)
    revalidatePath("/admin")

    return {
      success: true,
      booking: {
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        transferCode: booking.transferCode,
        totalPrice: booking.totalPrice,
        depositAmount: booking.depositAmount,
        pickupDate: booking.pickupDate,
        dropoffDate: booking.dropoffDate,
        location: booking.location,
        carName: car.name,
      },
      manualPayment: true,
    }
  } catch (error) {
    console.error("[CREATE_BOOKING_ERROR]", error)

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to create booking" }
  }
}

export async function updateBookingStatus(data: unknown) {
  try {
    const admin = await requireAdmin()

    // Validate input
    const validated = updateBookingStatusSchema.parse(data)

    const booking = await prisma.booking.findUnique({
      where: { id: validated.bookingId },
      include: { car: true, user: true },
    })

    if (!booking) {
      return { error: "Booking not found" }
    }

    // Update booking in transaction with audit log
    await prisma.$transaction(async (tx) => {
      const oldStatus = booking.status

      await tx.booking.update({
        where: { id: validated.bookingId },
        data: {
          status: validated.status,
          confirmedAt: validated.status === "CONFIRMED" ? new Date() : booking.confirmedAt,
          cancelledAt: validated.status === "CANCELLED" ? new Date() : booking.cancelledAt,
          completedAt: validated.status === "COMPLETED" ? new Date() : booking.completedAt,
        },
      })

      // Create audit log
      await tx.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action:
            validated.status === "CONFIRMED"
              ? "BOOKING_CONFIRMED"
              : validated.status === "CANCELLED"
                ? "BOOKING_CANCELLED"
                : "BOOKING_REJECTED",
          targetType: "booking",
          targetId: validated.bookingId,
          bookingId: validated.bookingId,
          oldValue: { status: oldStatus },
          newValue: { status: validated.status },
          reason: validated.reason,
        },
      })
    })

    // TODO: Send email notification to user

    revalidatePath("/admin")
    revalidatePath("/bookings")
    revalidatePath(`/bookings/${booking.id}`)

    return { success: true }
  } catch (error) {
    console.error("[UPDATE_BOOKING_STATUS_ERROR]", error)

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to update booking status" }
  }
}

export async function getUserBookings() {
  try {
    const user = await requireAuth()

    const bookings = await prisma.booking.findMany({
      where: { userId: user.id },
      include: {
        car: true,
      },
      orderBy: { createdAt: "desc" },
    })

    return { bookings }
  } catch (error) {
    console.error("[GET_USER_BOOKINGS_ERROR]", error)
    return { error: "Failed to fetch bookings" }
  }
}
