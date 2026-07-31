"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAuth, requireAdmin } from "@/lib/auth"
import { updateBookingStatusSchema } from "@/lib/validations"
import { config } from "@/lib/config"
import { sendBookingStatusEmail, sendBookingCompletionReviewEmail } from "@/lib/email"
import { z } from "zod"
import { PrismaPricingContextRepository } from "@/lib/pricing/prisma-repository"
import { quoteConfiguredVehicleRental } from "@/lib/booking-configuration/quote-service"
import { publicPricingErrorMessage, PricingError } from "@/lib/pricing/errors"
import { logger } from "@/lib/logger"
import {
  BookingPaymentTransitionError,
  cancelBookingWithReason,
  closeRefundReviewWithoutRefund as closeRefundReviewTransition,
  recordAdvancePayment as recordAdvancePaymentTransition,
  recordBookingRefund as recordBookingRefundTransition,
  recordRemainingBalance as recordRemainingBalanceTransition,
} from "@/lib/booking-payment-lifecycle"
import {
  dispatchBookingNotification,
  dispatchPendingBookingNotificationsForBooking,
  enqueueBookingNotification,
} from "@/lib/booking-notifications"
import {
  hasMinimumPickupLeadTime,
  isHandoverTimeAllowed,
  normalizeHandoverPolicy,
  normalizeOpeningHoursExceptions,
  normalizeWeeklyOpeningHours,
} from "@/lib/business-hours"
import { evaluateRentalHandoverCapacity } from "@/lib/handover-capacity"
import { formatBookingDateTime } from "@/lib/booking-time-zone"

const normalizeBookingLocale = (locale: string | null | undefined) => (locale === "de" ? "de" : "en")

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
    const requiredMode = validated.paymentMethod === "TRANSFER" ? "BANK_TRANSFER" : "CASH_ON_PICKUP"
    const [release, car] = await Promise.all([
      prisma.businessConfigurationRelease.findFirst({
        where: { status: "ACTIVE" },
        select: {
          generalRentalConfig: {
            select: {
              businessTimeZone: true,
              weeklyOpeningHours: true,
              openingHoursExceptions: true,
              handoverPolicy: true,
            },
          },
          paymentConfig: {
            select: {
              depositType: true,
              depositValue: true,
              methods: { where: { method: requiredMode }, select: { enabled: true } },
            },
          },
        },
      }),
      prisma.car.findFirst({
        where: {
          id: validated.carId,
          isDeleted: false,
          status: { in: ["AVAILABLE", "LOW_STOCK"] },
        },
        select: { id: true },
      }),
    ])
    if (!car)
      return { error: "This vehicle is not currently available for booking.", code: "VEHICLE_UNAVAILABLE" }
    if (!release?.paymentConfig.methods.some((method) => method.enabled))
      return { error: "This payment method is not available.", code: "PAYMENT_METHOD_UNAVAILABLE" }
    const weeklyOpeningHours = normalizeWeeklyOpeningHours(release.generalRentalConfig.weeklyOpeningHours)
    const openingHoursExceptions = normalizeOpeningHoursExceptions(release.generalRentalConfig.openingHoursExceptions)
    const handoverPolicy = normalizeHandoverPolicy(release.generalRentalConfig.handoverPolicy)
    const pickupAt = new Date(validated.pickupDate)
    const returnAt = new Date(validated.dropoffDate)
    if (!isHandoverTimeAllowed(pickupAt, release.generalRentalConfig.businessTimeZone, weeklyOpeningHours, openingHoursExceptions, handoverPolicy, "PICKUP"))
      return { error: "Pick-up must be during the rental company's opening hours.", code: "OUTSIDE_OPENING_HOURS" }
    if (!isHandoverTimeAllowed(returnAt, release.generalRentalConfig.businessTimeZone, weeklyOpeningHours, openingHoursExceptions, handoverPolicy, "RETURN"))
      return { error: "Return must be during the rental company's opening hours.", code: "OUTSIDE_OPENING_HOURS" }
    if (!hasMinimumPickupLeadTime(pickupAt, handoverPolicy))
      return { error: "Pick-up does not meet the rental company's minimum advance-booking time.", code: "INSUFFICIENT_LEAD_TIME" }
    const capacity = await evaluateRentalHandoverCapacity({ db: prisma, pickupAt, returnAt, policy: handoverPolicy })
    if (!capacity.pickupAvailable)
      return { error: "The selected pick-up slot has reached its handover capacity.", code: "PICKUP_SLOT_FULL" }
    if (!capacity.returnAvailable)
      return { error: "The selected return slot has reached its handover capacity.", code: "RETURN_SLOT_FULL" }
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
    const quote = publicQuote(configured)
    if (release.paymentConfig.depositType === "FIXED_AMOUNT") {
      quote.depositAmount = Math.min(release.paymentConfig.depositValue, quote.grandTotal)
      quote.depositRateBps = quote.grandTotal > 0 ? Math.round((quote.depositAmount / quote.grandTotal) * 10_000) : 0
    }
    return { quote }
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

    if (validated.status === "PENDING" || validated.status === "CONFIRMED") {
      return {
        error:
          validated.status === "CONFIRMED"
            ? "Use the payment confirmation action to confirm a transfer booking."
            : "Pending status is assigned automatically by the booking workflow.",
      }
    }
    if (["CANCELLED", "REJECTED"].includes(validated.status) && !validated.reason?.trim()) {
      return { error: "A reason is required when cancelling or rejecting a booking." }
    }
    if (validated.status === "CANCELLED") {
      await cancelBookingWithReason({ bookingId: booking.id, adminId: admin.id, reason: validated.reason!.trim() })
      await dispatchPendingBookingNotificationsForBooking(booking.id)
      revalidatePath("/admin")
      revalidatePath("/bookings")
      return { success: true }
    }
    if (validated.status === "IN_PROGRESS" && (booking.status !== "CONFIRMED" || booking.paymentStatus !== "PAID"))
      return { error: "Collect the full outstanding balance before starting the rental." }
    if (validated.status === "COMPLETED" && booking.status !== "IN_PROGRESS")
      return { error: "Only an in-progress rental can be completed." }
    if (validated.status === "REJECTED" && booking.status !== "PENDING")
      return { error: "Only a pending booking can be rejected." }

    // Update booking in transaction with audit log
    await prisma.$transaction(async (tx) => {
      const oldStatus = booking.status
      await tx.booking.update({
        where: { id: validated.bookingId },
        data: {
          status: validated.status,
          paymentStatus: booking.paymentStatus,
          confirmedAt: booking.confirmedAt,
          cancelledAt: validated.status === "CANCELLED" ? new Date() : booking.cancelledAt,
          completedAt: validated.status === "COMPLETED" ? new Date() : booking.completedAt,
        },
      })

      // Create audit log
      await tx.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: validated.status === "CANCELLED" ? "BOOKING_CANCELLED" : validated.status === "REJECTED" ? "BOOKING_REJECTED" : "BOOKING_STATUS_CHANGED",
          targetType: "booking",
          targetId: validated.bookingId,
          bookingId: validated.bookingId,
          oldValue: { status: oldStatus, paymentStatus: booking.paymentStatus },
          newValue: {
            status: validated.status,
            paymentStatus: booking.paymentStatus,
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
      if (validated.status === "COMPLETED") {
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
          pickupDate: formatBookingDateTime(booking.pickupDate, bookingLocale, booking.businessTimeZone, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          dropoffDate: formatBookingDateTime(booking.dropoffDate, bookingLocale, booking.businessTimeZone, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
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

const bookingPaymentActionSchema = z.object({ bookingId: z.string().min(1) })

export async function recordAdvancePayment(data: unknown) {
  try {
    const admin = await requireAdmin()
    const { bookingId } = bookingPaymentActionSchema.parse(data)
    const result = await recordAdvancePaymentTransition({ bookingId, adminId: admin.id })
    const deliveries = await dispatchPendingBookingNotificationsForBooking(bookingId)
    revalidatePath("/admin")
    revalidatePath("/bookings")
    return {
      success: true,
      ...result,
      confirmationEmailSent: deliveries.some((delivery) => "sent" in delivery),
    }
  } catch (error) {
    logger.error("booking.advance_payment_confirmation_failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    })
    if (error instanceof BookingPaymentTransitionError) return { error: error.message, code: error.code }
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message || "Invalid request" }
    return { error: "The advance payment could not be recorded." }
  }
}

export async function recordRemainingBalance(data: unknown) {
  try {
    const admin = await requireAdmin()
    const { bookingId } = bookingPaymentActionSchema.parse(data)
    const result = await recordRemainingBalanceTransition({ bookingId, adminId: admin.id })
    const deliveries = await dispatchPendingBookingNotificationsForBooking(bookingId)
    revalidatePath("/admin")
    revalidatePath("/bookings")
    return { success: true, ...result, receiptEmailSent: deliveries.some((delivery) => "sent" in delivery) }
  } catch (error) {
    logger.error("booking.pickup_payment_record_failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    })
    if (error instanceof BookingPaymentTransitionError) return { error: error.message, code: error.code }
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message || "Invalid request" }
    return { error: "The remaining balance could not be recorded." }
  }
}

export async function confirmTransferDeposit(data: unknown) {
  return recordAdvancePayment(data)
}

export async function recordPickupPayment(data: unknown) {
  return recordRemainingBalance(data)
}

const cancelBookingSchema = z.object({ bookingId: z.string().min(1), reason: z.string().trim().min(3).max(1_000) })
const refundBookingSchema = z.object({ bookingId: z.string().min(1), amount: z.number().int().positive(), reason: z.string().trim().min(3).max(1_000) })

export async function cancelBooking(data: unknown) {
  try {
    const admin = await requireAdmin()
    const values = cancelBookingSchema.parse(data)
    const result = await cancelBookingWithReason({ ...values, adminId: admin.id })
    const deliveries = await dispatchPendingBookingNotificationsForBooking(values.bookingId)
    revalidatePath("/admin")
    revalidatePath("/bookings")
    return { success: true, ...result, cancellationEmailSent: deliveries.some((delivery) => "sent" in delivery) }
  } catch (error) {
    if (error instanceof BookingPaymentTransitionError) return { error: error.message, code: error.code }
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message || "Invalid request" }
    logger.error("booking.cancellation_failed", error)
    return { error: "The booking could not be cancelled." }
  }
}

export async function recordBookingRefund(data: unknown) {
  try {
    const admin = await requireAdmin()
    const values = refundBookingSchema.parse(data)
    const result = await recordBookingRefundTransition({ ...values, adminId: admin.id })
    const deliveries = await dispatchPendingBookingNotificationsForBooking(values.bookingId)
    revalidatePath("/admin")
    revalidatePath("/bookings")
    return { success: true, ...result, refundEmailSent: deliveries.some((delivery) => "sent" in delivery) }
  } catch (error) {
    if (error instanceof BookingPaymentTransitionError) return { error: error.message, code: error.code }
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message || "Invalid request" }
    logger.error("booking.refund_record_failed", error)
    return { error: "The refund could not be recorded." }
  }
}

export async function closeRefundReviewWithoutRefund(data: unknown) {
  try {
    const admin = await requireAdmin()
    const values = cancelBookingSchema.parse(data)
    const result = await closeRefundReviewTransition({ ...values, adminId: admin.id })
    revalidatePath("/admin")
    return { success: true, ...result }
  } catch (error) {
    if (error instanceof BookingPaymentTransitionError) return { error: error.message, code: error.code }
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message || "Invalid request" }
    logger.error("booking.refund_review_close_failed", error)
    return { error: "The refund review could not be closed." }
  }
}

const retryNotificationSchema = z.object({ deliveryId: z.string().min(1) })

export async function retryBookingNotification(data: unknown) {
  try {
    const admin = await requireAdmin()
    const { deliveryId } = retryNotificationSchema.parse(data)
    const notification = await prisma.bookingNotification.findUnique({
      where: { id: deliveryId },
      select: { id: true, bookingId: true, status: true },
    })
    if (!notification) return { error: "Email delivery not found." }
    if (notification.status === "SENT") return { error: "This email has already been delivered." }
    await prisma.$transaction([
      prisma.bookingNotification.update({
        where: { id: notification.id },
        data: { status: "PENDING", nextAttemptAt: new Date(), lastErrorCode: null },
      }),
      prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "NOTIFICATION_RETRIED",
          targetType: "booking-notification",
          targetId: notification.id,
          bookingId: notification.bookingId,
          oldValue: { status: notification.status },
          newValue: { status: "PENDING" },
          reason: "Administrator requested another Gmail delivery attempt.",
        },
      }),
    ])
    const result = await dispatchBookingNotification(notification.id)
    revalidatePath("/admin")
    return "sent" in result ? { success: true } : { error: "Email delivery failed and will be retried automatically." }
  } catch (error) {
    logger.error("booking.notification_manual_retry_failed", error)
    return { error: "The email could not be retried." }
  }
}

const resendBookingConfirmationSchema = z.object({
  bookingId: z.string().min(1),
})

export async function resendBookingConfirmationAsAdmin(data: unknown) {
  try {
    await requireAdmin()
    const { bookingId } = resendBookingConfirmationSchema.parse(data)
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: true, customerDriverSnapshot: true },
    })
    if (!booking) return { error: "Booking not found" }
    if (booking.status !== "CONFIRMED")
      return {
        error: "Only confirmed bookings can receive a confirmation email.",
      }

    const notification = await enqueueBookingNotification(prisma, {
      bookingId,
      bookingNumber: booking.bookingNumber,
      event: "CUSTOMER_BOOKING_CONFIRMED",
      eventKeySuffix: `resend-${Date.now()}`,
      payload: { requestedByAdmin: true },
    })
    const result = await dispatchBookingNotification(notification.id)
    if (!("sent" in result)) return { error: "Email delivery failed and will be retried automatically." }
    return {
      success: true,
      customerEmail: booking.customerDriverSnapshot?.email || booking.user.email,
    }
  } catch (error) {
    logger.error("[RESEND_BOOKING_CONFIRMATION_ERROR]", error)
    return {
      error: error instanceof Error ? error.message : "Failed to resend confirmation email",
    }
  }
}

export async function getUserBookings() {
  try {
    const user = await requireAuth()
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
