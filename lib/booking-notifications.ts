import "server-only"

import type { BookingNotificationEvent, BookingPaymentMethod, Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { config } from "@/lib/config"
import { bookingTotalFromSnapshot } from "@/lib/pricing/snapshot"
import {
  sendAdminBookingNotification,
  sendBookingLifecycleEmail,
  sendManualPaymentEmail,
  sendPayAtPickupEmail,
  sendTransferExpiredEmail,
  sendTransferPaymentConfirmedEmail,
} from "@/lib/email"
import { logger } from "@/lib/logger"
import { formatBookingDateTime } from "@/lib/booking-time-zone"

type DbClient = Prisma.TransactionClient | typeof prisma

const RETRY_BASE_MS = 5 * 60 * 1000
const PROCESSING_STALE_MS = 10 * 60 * 1000

function normalizeLocale(locale: string): "de" | "en" {
  return locale === "de" ? "de" : "en"
}

function initialEvents(method: BookingPaymentMethod, requiresAdvance: boolean) {
  return [
    requiresAdvance ? "CUSTOMER_ADVANCE_INSTRUCTIONS" : "CUSTOMER_CASH_CONFIRMATION",
    "ADMIN_BOOKING_CREATED",
  ] as BookingNotificationEvent[]
}

export async function enqueueInitialBookingNotifications(
  db: DbClient,
  bookingId: string,
  bookingNumber: string,
  method: BookingPaymentMethod,
  requiresAdvance: boolean,
) {
  await db.bookingNotification.createMany({
    data: initialEvents(method, requiresAdvance).map((event) => ({
      bookingId,
      event,
      recipient: event === "ADMIN_BOOKING_CREATED" ? "ADMIN" : "CUSTOMER",
      eventKey: `${event.toLowerCase()}-${bookingNumber}`,
      payloadSnapshot: { bookingNumber, paymentMethod: method, requiresAdvance },
    })),
    skipDuplicates: true,
  })
}

export async function enqueueBookingNotification(
  db: DbClient,
  input: {
    bookingId: string
    bookingNumber: string
    event: BookingNotificationEvent
    recipient?: "CUSTOMER" | "ADMIN"
    payload?: Prisma.InputJsonValue
    eventKeySuffix?: string
  },
) {
  const eventKey = `${input.event.toLowerCase()}-${input.bookingNumber}${input.eventKeySuffix ? `-${input.eventKeySuffix}` : ""}`
  return db.bookingNotification.upsert({
    where: { eventKey },
    create: {
      bookingId: input.bookingId,
      event: input.event,
      recipient: input.recipient ?? "CUSTOMER",
      eventKey,
      payloadSnapshot: input.payload,
    },
    update: {},
  })
}

async function loadDeliveryContext(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      car: true,
      pricingSnapshot: true,
      customerDriverSnapshot: true,
      insuranceSnapshot: true,
      paymentPolicySnapshot: true,
      payments: {
        where: { status: { in: ["PAID", "REFUNDED"] } },
        select: { amount: true, kind: true },
      },
      legalAcceptances: {
        select: { documentType: true, documentVersionNumber: true, acceptedAt: true },
      },
    },
  })
}

async function deliver(event: BookingNotificationEvent, bookingId: string, idempotencyKey: string, payloadSnapshot: Prisma.JsonValue | null) {
  const booking = await loadDeliveryContext(bookingId)
  if (!booking) return { error: "Booking not found" }
  const locale = normalizeLocale(booking.locale)
  const customerEmail = booking.customerDriverSnapshot?.email || booking.user.email
  const userName =
    [booking.customerDriverSnapshot?.firstName, booking.customerDriverSnapshot?.lastName].filter(Boolean).join(" ") ||
    booking.user.name ||
    customerEmail
  const carName = locale === "de" ? booking.car.nameDe || booking.car.name : booking.car.name
  const companyDetails = booking.paymentPolicySnapshot
    ? {
        companyName: booking.paymentPolicySnapshot.companyName,
        companyEmail: booking.paymentPolicySnapshot.companyEmail,
        companyPhone: booking.paymentPolicySnapshot.companyPhone,
        companyAddress: booking.paymentPolicySnapshot.companyAddress,
        companyPostalCode: booking.paymentPolicySnapshot.companyPostalCode,
        companyCity: booking.paymentPolicySnapshot.companyCity,
        companyCountry: booking.paymentPolicySnapshot.companyCountry,
      }
    : undefined
  const common = {
    to: customerEmail,
    userName,
    carName,
    pickupDate: formatBookingDateTime(booking.pickupDate, locale, booking.businessTimeZone),
    dropoffDate: formatBookingDateTime(booking.dropoffDate, locale, booking.businessTimeZone),
    location: booking.location,
    bookingNumber: booking.bookingNumber,
    locale,
    idempotencyKey,
    companyDetails,
  }
  const totalPrice = bookingTotalFromSnapshot(booking)
  const receipts = booking.payments.filter((payment) => payment.kind === "RECEIPT").reduce((sum, payment) => sum + payment.amount, 0)
  const refunds = booking.payments.filter((payment) => payment.kind === "REFUND").reduce((sum, payment) => sum + payment.amount, 0)
  const netReceived = receipts - refunds
  const payload = payloadSnapshot && typeof payloadSnapshot === "object" && !Array.isArray(payloadSnapshot)
    ? payloadSnapshot as Record<string, unknown>
    : {}
  const currency = booking.pricingSnapshot?.currency || "EUR"
  const insurance = booking.insuranceSnapshot?.selected && booking.insuranceSnapshot.showInConfirmation
    ? { insuranceName: booking.insuranceSnapshot.customerFacingName, insuranceSubtotal: booking.insuranceSnapshot.subtotal }
    : {}
  const legalReferences = booking.legalAcceptances.map((acceptance) => ({
    type: acceptance.documentType,
    versionNumber: acceptance.documentVersionNumber,
    acceptedAt: acceptance.acceptedAt,
  }))

  switch (event) {
    case "CUSTOMER_TRANSFER_INSTRUCTIONS":
    case "CUSTOMER_ADVANCE_INSTRUCTIONS":
      return sendManualPaymentEmail({
        ...common,
        totalPrice,
        currency,
        depositAmount: booking.depositAmount,
        advancePaymentAmount: booking.advancePaymentAmount || (booking.paymentMethod === "TRANSFER" ? totalPrice : booking.depositAmount),
        selectedPaymentMethod: booking.paymentMethod,
        paymentDueAt: booking.paymentDueAt
          ? formatBookingDateTime(booking.paymentDueAt, locale, booking.businessTimeZone)
          : undefined,
        bankDetails: booking.paymentPolicySnapshot
          ? {
              bankName: booking.paymentPolicySnapshot.bankName,
              accountName: booking.paymentPolicySnapshot.accountName,
              swiftCode: booking.paymentPolicySnapshot.bic,
              iban: booking.paymentPolicySnapshot.iban,
            }
          : undefined,
        guaranteeAmount: booking.guaranteeAmount,
        transferCode: booking.transferCode,
        legalReferences,
        ...insurance,
      })
    case "CUSTOMER_CASH_CONFIRMATION":
      return sendPayAtPickupEmail({
        ...common,
        totalPrice,
        currency,
        guaranteeAmount: booking.guaranteeAmount,
        legalReferences,
        ...insurance,
      })
    case "CUSTOMER_TRANSFER_CONFIRMED":
      return sendTransferPaymentConfirmedEmail(common)
    case "CUSTOMER_BOOKING_CONFIRMED":
      return booking.paymentMethod === "TRANSFER"
        ? sendTransferPaymentConfirmedEmail(common)
        : sendPayAtPickupEmail({
            ...common,
            totalPrice,
            amountDueAtPickup: Math.max(totalPrice - netReceived, 0),
            advanceReceived: booking.advancePaymentAmount > 0,
            currency,
            guaranteeAmount: booking.guaranteeAmount,
            legalReferences,
            ...insurance,
          })
    case "CUSTOMER_TRANSFER_EXPIRED":
    case "CUSTOMER_PAYMENT_EXPIRED":
      return sendTransferExpiredEmail({
        to: common.to,
        userName: common.userName,
        carName: common.carName,
        bookingNumber: common.bookingNumber,
        locale,
        idempotencyKey,
      })
    case "CUSTOMER_BALANCE_RECEIPT":
      return sendBookingLifecycleEmail({
        to: common.to,
        userName: common.userName,
        bookingNumber: common.bookingNumber,
        locale,
        event: "BALANCE_RECEIPT",
        amount: typeof payload.amount === "number" ? payload.amount : 0,
        currency,
        idempotencyKey,
      })
    case "CUSTOMER_BOOKING_CANCELLED":
      return sendBookingLifecycleEmail({
        to: common.to,
        userName: common.userName,
        bookingNumber: common.bookingNumber,
        locale,
        event: "CANCELLED",
        reason: typeof payload.reason === "string" ? payload.reason : undefined,
        idempotencyKey,
      })
    case "CUSTOMER_REFUND_CONFIRMED":
      return sendBookingLifecycleEmail({
        to: common.to,
        userName: common.userName,
        bookingNumber: common.bookingNumber,
        locale,
        event: "REFUND_CONFIRMED",
        amount: typeof payload.amount === "number" ? payload.amount : 0,
        currency,
        idempotencyKey,
      })
    case "ADMIN_BOOKING_CREATED":
      return sendAdminBookingNotification({
        adminEmails: [...config.adminEmails],
        userName,
        userEmail: customerEmail,
        carName,
        pickupDate: common.pickupDate,
        dropoffDate: common.dropoffDate,
        location: booking.location,
        totalPrice,
        currency,
        depositAmount: booking.depositAmount,
        guaranteeAmount: booking.guaranteeAmount,
        transferCode: booking.transferCode,
        bookingNumber: booking.bookingNumber,
        bookingId: booking.id,
        paymentMethod: booking.paymentMethod,
        idempotencyKey,
      })
  }
}

export async function dispatchBookingNotification(notificationId: string, now = new Date()) {
  const staleBefore = new Date(now.getTime() - PROCESSING_STALE_MS)
  const claimed = await prisma.bookingNotification.updateMany({
    where: {
      id: notificationId,
      status: { not: "SENT" },
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", lastAttemptAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: "PROCESSING",
      lastAttemptAt: now,
      attemptCount: { increment: 1 },
      lastErrorCode: null,
    },
  })
  if (!claimed.count) return { skipped: true }
  const notification = await prisma.bookingNotification.findUnique({ where: { id: notificationId } })
  if (!notification) return { skipped: true }

  try {
    const result = await deliver(notification.event, notification.bookingId, notification.eventKey, notification.payloadSnapshot)
    if ("error" in result && result.error) throw new Error(result.error)
    await prisma.bookingNotification.update({
      where: { id: notification.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId: "id" in result ? result.id : null,
        lastErrorCode: null,
      },
    })
    return { sent: true }
  } catch (error) {
    const delay = Math.min(RETRY_BASE_MS * 2 ** Math.min(notification.attemptCount, 6), 24 * 60 * 60 * 1000)
    await prisma.bookingNotification.update({
      where: { id: notification.id },
      data: {
        status: "FAILED",
        nextAttemptAt: new Date(Date.now() + delay),
        lastErrorCode: "EMAIL_DELIVERY_FAILED",
      },
    })
    logger.error("booking.notification_delivery_failed", {
      notificationId: notification.id,
      bookingId: notification.bookingId,
      event: notification.event,
      error: error instanceof Error ? error.name : "UnknownError",
    })
    return { error: "Email delivery failed" }
  }
}

export async function dispatchPendingBookingNotificationsForBooking(bookingId: string) {
  const notifications = await prisma.bookingNotification.findMany({
    where: { bookingId, status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: new Date() } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  })
  const results = []
  for (const notification of notifications) results.push(await dispatchBookingNotification(notification.id))
  return results
}

export async function processBookingNotificationOutbox(limit = 25) {
  const now = new Date()
  const notifications = await prisma.bookingNotification.findMany({
    where: {
      status: { in: ["PENDING", "FAILED", "PROCESSING"] },
      OR: [
        { nextAttemptAt: { lte: now }, status: { in: ["PENDING", "FAILED"] } },
        { status: "PROCESSING", lastAttemptAt: { lt: new Date(now.getTime() - PROCESSING_STALE_MS) } },
      ],
    },
    select: { id: true },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  })
  let sent = 0
  let failed = 0
  for (const notification of notifications) {
    const result = await dispatchBookingNotification(notification.id, now)
    if ("sent" in result) sent += 1
    else if ("error" in result) failed += 1
  }
  return { examined: notifications.length, sent, failed }
}
