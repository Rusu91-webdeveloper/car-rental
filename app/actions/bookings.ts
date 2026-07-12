"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAuth, requireAdmin } from "@/lib/auth"
import { createBookingSchema, updateBookingStatusSchema } from "@/lib/validations"
// import { stripe } from "@/lib/stripe"
import { config } from "@/lib/config"
import {
  sendManualPaymentEmail,
  sendPayAtPickupEmail,
  sendAdminBookingNotification,
  sendBookingStatusEmail,
  sendAdminBookingConfirmationNotification,
  sendBookingConfirmationEmail,
  sendBookingCompletionReviewEmail,
} from "@/lib/email"
import { runBookingLifecycleMaintenance } from "@/lib/booking-expiration"
import crypto from "crypto"
import { z } from "zod"
import { PrismaPricingContextRepository } from "@/lib/pricing/prisma-repository"
import { quoteConfiguredVehicleRental } from "@/lib/booking-configuration/quote-service"
import { publicPricingErrorMessage, PricingError } from "@/lib/pricing/errors"
import { bookingTotalFromSnapshot } from "@/lib/pricing/snapshot"
import { createAuthoritativeBooking } from "@/lib/pricing/prisma-booking-service"

const normalizeBookingLocale = (locale: string | null | undefined) => (locale === "de" ? "de" : "en")

const formatDateForLocale = (date: Date, locale: string) =>
  new Date(date).toLocaleDateString(locale === "de" ? "de-DE" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

const bookingQuoteSchema = z
  .object({
    carId: z.string().min(1),
    pickupDate: z.string().datetime(),
    dropoffDate: z.string().datetime(),
    paymentMethod: z.enum(["TRANSFER", "PAY_AT_PICKUP"]).default("TRANSFER"),
    insuranceSelected: z.boolean().optional().default(false),
  })
  .refine((value) => new Date(value.dropoffDate) > new Date(value.pickupDate), {
    message: "Drop-off date must be after pickup date",
    path: ["dropoffDate"],
  })

function publicQuote(configured: Awaited<ReturnType<typeof quoteConfiguredVehicleRental>>) {
  const quote = configured.quote
  return {
    currency: quote.currency,
    pickupAt: quote.pickupAt,
    returnAt: quote.returnAt,
    chargeableDays: quote.chargeableDuration.chargeableDays,
    durationStrategy: quote.durationStrategy,
    dailyUnits: quote.units.daily,
    weeklyUnits: quote.units.weekly,
    monthlyUnits: quote.units.monthly,
    sourceDailyRate: quote.sourceDailyRate,
    sourceWeeklyRate: quote.sourceWeeklyRate,
    sourceMonthlyRate: quote.sourceMonthlyRate,
    selectedStrategy: quote.selectedStrategy,
    baseSubtotal: quote.baseSubtotal,
    adjustmentTotal: quote.adjustmentTotal,
    insuranceSubtotal: quote.insuranceSubtotal,
    taxTreatment: quote.taxTreatment,
    taxRateBps: quote.taxRateBps,
    taxSubtotal: quote.taxSubtotal,
    grandTotal: quote.grandTotal,
    depositAmount: quote.payment.depositAmount,
    guaranteeAmount: quote.payment.guaranteeAmount,
    depositRateBps: quote.payment.depositRateBps,
    guaranteeRateBps: quote.payment.guaranteeRateBps,
    pricingEngineVersion: quote.pricingEngineVersion,
    compatibilityMode: quote.compatibilityMode,
    trace: quote.trace,
    warnings: quote.warnings,
    insurance: configured.insurance
      ? {
          enabled: configured.insurance.enabled,
          selected: configured.insurance.selected,
          requirementMode: configured.insurance.requirementMode,
          customerFacingName: configured.insurance.customerFacingName,
          description: configured.insurance.description,
          unitPrice: configured.insurance.unitPrice,
          billableDays: configured.insurance.billableDays,
          subtotal: configured.insurance.subtotal,
          currency: configured.insurance.currency,
          availableForVehicle: configured.insurance.availableForVehicle,
          showCustomerSelection: configured.insurance.showCustomerSelection,
        }
      : undefined,
  }
}

export async function getBookingQuote(data: unknown) {
  try {
    await requireAuth()
    const validated = bookingQuoteSchema.parse(data)
    const configured = await quoteConfiguredVehicleRental({
      db: prisma,
      pricingRepository: new PrismaPricingContextRepository(prisma),
      locale: "en",
      insuranceSelected: validated.insuranceSelected,
      request: {
        vehicleId: validated.carId,
        pickupAt: new Date(validated.pickupDate),
        returnAt: new Date(validated.dropoffDate),
        paymentMethod: validated.paymentMethod,
      },
    })
    return { quote: publicQuote(configured) }
  } catch (error) {
    console.error("[GET_BOOKING_QUOTE_ERROR]", error)
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Invalid quote request" }
    if (error instanceof PricingError) return { error: publicPricingErrorMessage(error), code: error.code }
    return {
      error: "A valid price could not be calculated. Please try again or contact support.",
    }
  }
}

export async function createBooking(data: unknown) {
  try {
    const user = await requireAuth()
    await runBookingLifecycleMaintenance()

    // Validate input
    const validated = createBookingSchema.parse(data)
    const bookingLocale = normalizeBookingLocale(validated.locale)

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

    // Generate unique booking number and transfer code
    const bookingNumber = `BK${Date.now().toString().slice(-8)}`
    const transferCode = crypto.randomBytes(4).toString("hex").toUpperCase()

    const transactionResult = await createAuthoritativeBooking(prisma, {
      userId: user.id,
      vehicleId: validated.carId,
      pickupAt: pickupDate,
      returnAt: dropoffDate,
      location: validated.location,
      locale: bookingLocale,
      paymentMethod: validated.paymentMethod,
      bookingNumber,
      transferCode,
      customer: validated.customer,
      insuranceSelected: validated.insuranceSelected,
    })
    const { booking, quote, insurance, customer } = transactionResult

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
                description: `${quote.chargeableDuration.chargeableDays} day(s) - ${validated.location}`,
                ...(stripeImages.length > 0 ? { images: stripeImages } : {}),
              },
              unit_amount: quote.grandTotal,
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
    const userEmailLocale = normalizeBookingLocale(booking.locale)
    const userCarName = userEmailLocale === "de" ? car.nameDe || car.name : car.name

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

      const userEmailResult =
        validated.paymentMethod === "TRANSFER"
          ? await sendManualPaymentEmail({
              to: customer?.email || user.email,
              userName: customer ? `${customer.firstName} ${customer.lastName}` : user.name || user.email,
              carName: userCarName,
              pickupDate: formatDateForLocale(booking.pickupDate, userEmailLocale),
              dropoffDate: formatDateForLocale(booking.dropoffDate, userEmailLocale),
              location: booking.location,
              totalPrice: quote.grandTotal,
              currency: quote.currency,
              depositAmount: booking.depositAmount,
              guaranteeAmount: booking.guaranteeAmount,
              transferCode: booking.transferCode,
              bookingNumber: booking.bookingNumber,
              locale: userEmailLocale,
              insuranceName:
                insurance?.showInConfirmation && insurance.selected ? insurance.customerFacingName : undefined,
              insuranceSubtotal: insurance?.showInConfirmation && insurance.selected ? insurance.subtotal : undefined,
            })
          : await sendPayAtPickupEmail({
              to: customer?.email || user.email,
              userName: customer ? `${customer.firstName} ${customer.lastName}` : user.name || user.email,
              carName: userCarName,
              pickupDate: formatDateForLocale(booking.pickupDate, userEmailLocale),
              dropoffDate: formatDateForLocale(booking.dropoffDate, userEmailLocale),
              location: booking.location,
              totalPrice: quote.grandTotal,
              currency: quote.currency,
              guaranteeAmount: booking.guaranteeAmount,
              bookingNumber: booking.bookingNumber,
              locale: userEmailLocale,
              insuranceName:
                insurance?.showInConfirmation && insurance.selected ? insurance.customerFacingName : undefined,
              insuranceSubtotal: insurance?.showInConfirmation && insurance.selected ? insurance.subtotal : undefined,
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
        pickupDate: formatDateForLocale(booking.pickupDate, "en"),
        dropoffDate: formatDateForLocale(booking.dropoffDate, "en"),
        location: booking.location,
        totalPrice: quote.grandTotal,
        currency: quote.currency,
        depositAmount: booking.depositAmount,
        guaranteeAmount: booking.guaranteeAmount,
        transferCode: booking.transferCode,
        bookingNumber: booking.bookingNumber,
        bookingId: booking.id,
        paymentMethod: booking.paymentMethod,
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
        totalPrice: quote.grandTotal,
        currency: quote.currency,
        depositAmount: booking.depositAmount,
        guaranteeAmount: booking.guaranteeAmount,
        pickupDate: booking.pickupDate,
        dropoffDate: booking.dropoffDate,
        location: booking.location,
        carName: userCarName,
        paymentMethod: booking.paymentMethod,
        depositRateBps: quote.payment.depositRateBps,
        guaranteeRateBps: quote.payment.guaranteeRateBps,
        insurance:
          insurance?.showInConfirmation && insurance.selected
            ? {
                customerFacingName: insurance.customerFacingName,
                subtotal: insurance.subtotal,
                showInConfirmation: true,
              }
            : undefined,
      },
      manualPayment: true,
    }
  } catch (error) {
    console.error("[CREATE_BOOKING_ERROR]", error)

    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0]
      const fallbackMessage = "Please review your booking details and try again."
      const zodMessage = firstIssue?.message ?? fallbackMessage
      const messageMap: Record<string, string> = {
        "Pickup date must be in the future": "Please select a pickup date and time in the future.",
        "Drop-off date must be after pickup date": "Drop-off must be after pickup.",
        "Invalid datetime": "Please select valid pickup and drop-off dates.",
        Required: "Please fill in all required booking fields.",
      }

      return { error: messageMap[zodMessage] ?? zodMessage }
    }

    if (error instanceof PricingError) {
      return { error: publicPricingErrorMessage(error), code: error.code }
    }

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
      include: { car: true, user: true, pricingSnapshot: true },
    })

    if (!booking) {
      return { error: "Booking not found" }
    }

    // Update booking in transaction with audit log
    await prisma.$transaction(async (tx) => {
      const oldStatus = booking.status
      const nextPaymentStatus =
        validated.status === "COMPLETED" && booking.paymentStatus === "PENDING" ? "PAID" : booking.paymentStatus

      await tx.booking.update({
        where: { id: validated.bookingId },
        data: {
          status: validated.status,
          paymentStatus: nextPaymentStatus,
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
          oldValue: { status: oldStatus, paymentStatus: booking.paymentStatus },
          newValue: {
            status: validated.status,
            paymentStatus: nextPaymentStatus,
          },
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
      const bookingLocale = normalizeBookingLocale(booking.locale)
      // Send appropriate email based on status
      if (validated.status === "CONFIRMED") {
        console.log("[BOOKING] Sending CONFIRMED status emails:", {
          bookingNumber: booking.bookingNumber,
          userEmail: booking.user.email,
          adminEmails: config.adminEmails,
        })

        const userCarName = bookingLocale === "de" ? booking.car.nameDe || booking.car.name : booking.car.name
        const userConfirmationResult = await sendBookingConfirmationEmail({
          to: booking.user.email,
          userName: booking.user.name || booking.user.email,
          carName: userCarName,
          pickupDate: formatDateForLocale(booking.pickupDate, bookingLocale),
          dropoffDate: formatDateForLocale(booking.dropoffDate, bookingLocale),
          location: booking.location,
          totalPrice: bookingTotalFromSnapshot(booking),
          currency: booking.pricingSnapshot?.currency,
          guaranteeAmount: booking.guaranteeAmount,
          transferCode: booking.paymentMethod === "TRANSFER" ? booking.transferCode : undefined,
          paymentMethod: booking.paymentMethod,
          bookingNumber: booking.bookingNumber,
          locale: bookingLocale,
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
          pickupDate: formatDateForLocale(booking.pickupDate, "en"),
          dropoffDate: formatDateForLocale(booking.dropoffDate, "en"),
          location: booking.location,
          totalPrice: bookingTotalFromSnapshot(booking),
          currency: booking.pricingSnapshot?.currency,
          guaranteeAmount: booking.guaranteeAmount,
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
      } else if (validated.status === "COMPLETED") {
        console.log("[BOOKING] Sending COMPLETED status email:", {
          bookingNumber: booking.bookingNumber,
          userEmail: booking.user.email,
        })

        const localizedCarName = bookingLocale === "de" ? booking.car.nameDe || booking.car.name : booking.car.name
        const reviewUrl = `${config.appUrl.replace(/\/$/, "")}/${bookingLocale}/bookings`
        const completionEmailResult = await sendBookingCompletionReviewEmail({
          to: booking.user.email,
          userName: booking.user.name || booking.user.email,
          carName: localizedCarName,
          bookingNumber: booking.bookingNumber,
          pickupDate: formatDateForLocale(booking.pickupDate, bookingLocale),
          dropoffDate: formatDateForLocale(booking.dropoffDate, bookingLocale),
          reviewUrl,
          locale: bookingLocale,
        })

        if (completionEmailResult.error) {
          console.error("[BOOKING] Failed to send booking completion email:", {
            bookingNumber: booking.bookingNumber,
            userEmail: booking.user.email,
            error: completionEmailResult.error,
          })
        } else {
          console.log("[BOOKING] ✅ Booking completion email sent successfully:", {
            bookingNumber: booking.bookingNumber,
            userEmail: booking.user.email,
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
          bookingLocale === "de" ? booking.car.nameDe || booking.car.name : booking.car.name,
          validated.status,
          booking.bookingNumber,
          bookingLocale,
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
    await runBookingLifecycleMaintenance()

    const bookings = await prisma.booking.findMany({
      where: { userId: user.id },
      include: {
        car: true,
        pricingSnapshot: true,
      },
      orderBy: { createdAt: "desc" },
    })

    return { bookings }
  } catch (error) {
    console.error("[GET_USER_BOOKINGS_ERROR]", error)
    return { error: "Failed to fetch bookings" }
  }
}
