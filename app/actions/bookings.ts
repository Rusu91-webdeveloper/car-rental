"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAuth, requireAdmin } from "@/lib/auth"
import { createBookingSchema, updateBookingStatusSchema } from "@/lib/validations"
import { isCarAvailable, calculateTotalDays } from "@/lib/availability"
// import { stripe } from "@/lib/stripe"
import { config } from "@/lib/config"
import {
  sendManualPaymentEmail,
  sendAdminBookingNotification,
  sendBookingStatusEmail,
  sendAdminBookingConfirmationNotification,
  sendBookingConfirmationEmail,
} from "@/lib/email"
import { cancelExpiredBookings } from "@/lib/booking-expiration"
import crypto from "crypto"
import { Prisma } from "@prisma/client"

export async function createBooking(data: unknown) {
  try {
    const user = await requireAuth()
    await cancelExpiredBookings()

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

    // Stripe checkout flow is temporarily disabled.
    // Uncomment this block when you want to re-enable Stripe integration.
    /*
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
    */

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

    // Send email notifications
    console.log("[BOOKING] Email configuration check:", {
      emailEnabled: config.features.emailEnabled,
      adminEmails: config.adminEmails,
      userEmail: user.email,
      bookingNumber: booking.bookingNumber,
    })

    if (config.features.emailEnabled) {
      console.log("[BOOKING] Sending emails for new booking:", {
        bookingNumber: booking.bookingNumber,
        userEmail: user.email,
        adminEmails: config.adminEmails,
      })

      // Send payment instructions to user
      const userEmailResult = await sendManualPaymentEmail({
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

      if (userEmailResult.error) {
        console.error("[BOOKING] Failed to send user email:", {
          bookingNumber: booking.bookingNumber,
          error: userEmailResult.error,
        })
      } else {
        console.log("[BOOKING] ✅ User email sent successfully:", {
          bookingNumber: booking.bookingNumber,
          userEmail: user.email,
        })
      }

      // Send notification to admin
      const adminEmailResult = await sendAdminBookingNotification({
        adminEmails: config.adminEmails,
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

      if (adminEmailResult.error) {
        console.error("[BOOKING] Failed to send admin email:", {
          bookingNumber: booking.bookingNumber,
          adminEmails: config.adminEmails,
          error: adminEmailResult.error,
        })
      } else {
        console.log("[BOOKING] ✅ Admin email sent successfully:", {
          bookingNumber: booking.bookingNumber,
          adminEmails: config.adminEmails,
        })
      }
    } else {
      console.warn("[BOOKING] Email is disabled. Skipping email notifications:", {
        bookingNumber: booking.bookingNumber,
        userEmail: user.email,
        adminEmails: config.adminEmails,
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

    // Send email notifications based on status change
    console.log("[BOOKING] Status update email configuration check:", {
      emailEnabled: config.features.emailEnabled,
      userEmail: booking.user?.email,
      adminEmails: config.adminEmails,
      bookingNumber: booking.bookingNumber,
      oldStatus: booking.status,
      newStatus: validated.status,
    })

    if (config.features.emailEnabled && booking.user?.email) {
      // Send appropriate email based on status
      if (validated.status === "CONFIRMED") {
        console.log("[BOOKING] Sending CONFIRMED status emails:", {
          bookingNumber: booking.bookingNumber,
          userEmail: booking.user.email,
          adminEmails: config.adminEmails,
        })

        // Send detailed confirmation email to user
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

        const userConfirmationResult = await sendBookingConfirmationEmail({
          to: booking.user.email,
          userName: booking.user.name || booking.user.email,
          carName: booking.car.name,
          pickupDate: formatDateForEmail(booking.pickupDate),
          dropoffDate: formatDateForEmail(booking.dropoffDate),
          location: booking.location,
          totalPrice: booking.totalPrice,
          transferCode: booking.transferCode,
          bookingNumber: booking.bookingNumber,
        })

        if (userConfirmationResult.error) {
          console.error("[BOOKING] Failed to send user confirmation email:", {
            bookingNumber: booking.bookingNumber,
            userEmail: booking.user.email,
            error: userConfirmationResult.error,
          })
        } else {
          console.log("[BOOKING] ✅ User confirmation email sent successfully:", {
            bookingNumber: booking.bookingNumber,
            userEmail: booking.user.email,
          })
        }

        // Send confirmation notification to admin
        const adminConfirmationResult = await sendAdminBookingConfirmationNotification({
          adminEmails: config.adminEmails,
          userName: booking.user.name || booking.user.email,
          userEmail: booking.user.email,
          carName: booking.car.name,
          pickupDate: formatDateForEmail(booking.pickupDate),
          dropoffDate: formatDateForEmail(booking.dropoffDate),
          location: booking.location,
          totalPrice: booking.totalPrice,
          transferCode: booking.transferCode,
          bookingNumber: booking.bookingNumber,
          bookingId: booking.id,
        })

        if (adminConfirmationResult.error) {
          console.error("[BOOKING] Failed to send admin confirmation email:", {
            bookingNumber: booking.bookingNumber,
            adminEmails: config.adminEmails,
            error: adminConfirmationResult.error,
          })
        } else {
          console.log("[BOOKING] ✅ Admin confirmation email sent successfully:", {
            bookingNumber: booking.bookingNumber,
            adminEmails: config.adminEmails,
          })
        }
      } else {
        // Send status update email for other statuses (CANCELLED, REJECTED)
        console.log("[BOOKING] Sending status update email:", {
          bookingNumber: booking.bookingNumber,
          status: validated.status,
          userEmail: booking.user.email,
        })

        const statusEmailResult = await sendBookingStatusEmail(
          booking.user.email,
          booking.user.name || booking.user.email,
          booking.car.name,
          validated.status,
          booking.bookingNumber,
        )

        if (statusEmailResult.error) {
          console.error("[BOOKING] Failed to send status update email:", {
            bookingNumber: booking.bookingNumber,
            status: validated.status,
            userEmail: booking.user.email,
            error: statusEmailResult.error,
          })
        } else {
          console.log("[BOOKING] ✅ Status update email sent successfully:", {
            bookingNumber: booking.bookingNumber,
            status: validated.status,
            userEmail: booking.user.email,
          })
        }
      }
    } else {
      if (!config.features.emailEnabled) {
        console.warn("[BOOKING] Email is disabled. Skipping status update emails:", {
          bookingNumber: booking.bookingNumber,
          status: validated.status,
        })
      } else if (!booking.user?.email) {
        console.warn("[BOOKING] User email not found. Skipping status update emails:", {
          bookingNumber: booking.bookingNumber,
          status: validated.status,
          userId: booking.userId,
        })
      }
    }

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
    await cancelExpiredBookings()

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
