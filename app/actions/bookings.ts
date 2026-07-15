"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAuth, requireAdmin } from "@/lib/auth"
import { updateBookingStatusSchema } from "@/lib/validations"
import { config } from "@/lib/config"
import {
  sendBookingStatusEmail,
  sendAdminBookingConfirmationNotification,
  sendBookingConfirmationEmail,
  sendBookingCompletionReviewEmail,
} from "@/lib/email"
import { runBookingLifecycleMaintenance } from "@/lib/booking-expiration"
import { z } from "zod"
import { PrismaPricingContextRepository } from "@/lib/pricing/prisma-repository"
import { quoteConfiguredVehicleRental } from "@/lib/booking-configuration/quote-service"
import { publicPricingErrorMessage, PricingError } from "@/lib/pricing/errors"
import { bookingTotalFromSnapshot } from "@/lib/pricing/snapshot"
import { logger } from "@/lib/logger"
import { loadBookingConfirmationConfiguration } from "@/lib/booking-confirmation-configuration"

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
    logger.error("[GET_BOOKING_QUOTE_ERROR]", error)
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Invalid quote request" }
    if (error instanceof PricingError) return { error: publicPricingErrorMessage(error), code: error.code }
    return {
      error: "A valid price could not be calculated. Please try again or contact support.",
    }
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
    logger.info("[BOOKING] Status update email configuration check:", {
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
      if (validated.status === "CONFIRMED" && booking.status !== "CONFIRMED") {
        logger.info("[BOOKING] Sending CONFIRMED status emails:", {
          bookingNumber: booking.bookingNumber,
          userEmail: booking.user.email,
          adminEmails: config.adminEmails,
        })

        const userCarName = bookingLocale === "de" ? booking.car.nameDe || booking.car.name : booking.car.name
        const confirmationConfiguration = await loadBookingConfirmationConfiguration(booking.id)
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
          confirmationHeading: confirmationConfiguration.heading,
          confirmationContent: confirmationConfiguration.content,
          paymentMode: confirmationConfiguration.paymentMode,
          paymentInstructions: confirmationConfiguration.paymentInstructions,
          showPaymentInstructions: confirmationConfiguration.showPaymentInstructions,
        })

        if (userConfirmationResult.error) {
          logger.error("[BOOKING] Failed to send user confirmation email:", {
            bookingNumber: booking.bookingNumber,
            userEmail: booking.user.email,
            error: userConfirmationResult.error,
          })
        } else {
          logger.info("[BOOKING] ✅ User confirmation email sent successfully:", {
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
          logger.error("[BOOKING] Failed to send admin confirmation email:", {
            bookingNumber: booking.bookingNumber,
            adminEmails: config.adminEmails,
            error: adminConfirmationResult.error,
          })
        } else {
          logger.info("[BOOKING] ✅ Admin confirmation email sent successfully:", {
            bookingNumber: booking.bookingNumber,
            adminEmails: config.adminEmails,
          })
        }
      } else if (validated.status === "COMPLETED") {
        logger.info("[BOOKING] Sending COMPLETED status email:", {
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
          logger.error("[BOOKING] Failed to send booking completion email:", {
            bookingNumber: booking.bookingNumber,
            userEmail: booking.user.email,
            error: completionEmailResult.error,
          })
        } else {
          logger.info("[BOOKING] ✅ Booking completion email sent successfully:", {
            bookingNumber: booking.bookingNumber,
            userEmail: booking.user.email,
          })
        }
      } else {
        // Send status update email for other statuses (CANCELLED, REJECTED)
        logger.info("[BOOKING] Sending status update email:", {
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
          logger.error("[BOOKING] Failed to send status update email:", {
            bookingNumber: booking.bookingNumber,
            status: validated.status,
            userEmail: booking.user.email,
            error: statusEmailResult.error,
          })
        } else {
          logger.info("[BOOKING] ✅ Status update email sent successfully:", {
            bookingNumber: booking.bookingNumber,
            status: validated.status,
            userEmail: booking.user.email,
          })
        }
      }
    } else {
      if (!config.features.emailEnabled) {
        logger.warn("[BOOKING] Email is disabled. Skipping status update emails:", {
          bookingNumber: booking.bookingNumber,
          status: validated.status,
        })
      } else if (!booking.user?.email) {
        logger.warn("[BOOKING] User email not found. Skipping status update emails:", {
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
    logger.error("[UPDATE_BOOKING_STATUS_ERROR]", error)

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
    logger.error("[GET_USER_BOOKINGS_ERROR]", error)
    return { error: "Failed to fetch bookings" }
  }
}
