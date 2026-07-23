import "server-only"

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { enqueueBookingNotification } from "@/lib/booking-notifications"

export class BookingPaymentTransitionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = "BookingPaymentTransitionError"
  }
}

function transitionError(code: string, message: string): never {
  throw new BookingPaymentTransitionError(code, message)
}

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 20_000,
} as const

function totals(booking: {
  totalPrice: number
  pricingSnapshot: { grandTotal: number } | null
  payments?: Array<{ amount: number; kind?: "RECEIPT" | "REFUND"; status: string }>
}) {
  const total = booking.pricingSnapshot?.grandTotal ?? booking.totalPrice
  const payments = booking.payments ?? []
  const received = payments
    .filter((payment) => payment.kind !== "REFUND" && payment.status === "PAID")
    .reduce((sum, payment) => sum + payment.amount, 0)
  const refunded = payments
    .filter((payment) => payment.kind === "REFUND" && payment.status === "REFUNDED")
    .reduce((sum, payment) => sum + payment.amount, 0)
  const netReceived = Math.max(received - refunded, 0)
  return { total, received, refunded, netReceived, outstanding: Math.max(total - netReceived, 0) }
}

const bookingPaymentInclude = {
  pricingSnapshot: true,
  paymentPolicySnapshot: true,
  payments: {
    where: { status: { in: ["PAID", "REFUNDED"] } },
    select: { amount: true, kind: true, status: true },
  },
} satisfies Prisma.BookingInclude

export async function recordAdvancePayment(input: { bookingId: string; adminId: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${input.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId }, include: bookingPaymentInclude })
    if (!booking) transitionError("BOOKING_NOT_FOUND", "Booking not found.")
    if (["CANCELLED", "REJECTED", "IN_PROGRESS", "COMPLETED"].includes(booking.status))
      transitionError("BOOKING_NOT_PAYABLE", "This booking can no longer receive an advance payment.")
    if (booking.paymentStatus !== "PENDING")
      transitionError("PAYMENT_ALREADY_RECORDED", "The required advance payment has already been recorded.")
    if (booking.status === "PENDING" && booking.paymentDueAt && booking.paymentDueAt <= new Date())
      transitionError("PAYMENT_WINDOW_EXPIRED", "The 24-hour payment window has expired.")

    const financials = totals(booking)
    const legacyAdvance = booking.depositAmount > 0 ? booking.depositAmount : booking.paymentMethod === "TRANSFER" ? financials.total : 0
    const requiredAdvance = Math.min(booking.advancePaymentAmount || legacyAdvance, financials.total)
    if (requiredAdvance <= 0)
      transitionError("NO_ADVANCE_DUE", "This booking does not require an advance payment.")
    const amount = Math.max(requiredAdvance - financials.netReceived, 0)
    if (amount <= 0) transitionError("PAYMENT_ALREADY_RECORDED", "The required advance payment has already been recorded.")

    const now = new Date()
    const resultingNet = financials.netReceived + amount
    const fullyPaid = resultingNet >= financials.total
    const payment = await tx.payment.create({
      data: {
        bookingId: booking.id,
        amount,
        currency: (booking.pricingSnapshot?.currency || "EUR").toLowerCase(),
        status: "PAID",
        kind: "RECEIPT",
        purpose: fullyPaid ? "FULL" : "DEPOSIT",
        method: "TRANSFER",
        receivedAt: now,
        recordedById: input.adminId,
        metadata: { source: "ADMIN_ADVANCE_VERIFICATION", transferCode: booking.transferCode },
      },
    })
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "CONFIRMED",
        paymentStatus: fullyPaid ? "PAID" : "DEPOSIT_PAID",
        confirmedAt: booking.confirmedAt ?? now,
        paymentDueAt: null,
      },
    })
    await tx.adminAuditLog.createMany({
      data: [
        {
          adminId: input.adminId,
          action: "PAYMENT_RECEIVED",
          targetType: "booking",
          targetId: booking.id,
          bookingId: booking.id,
          oldValue: { paymentStatus: booking.paymentStatus },
          newValue: { paymentStatus: updated.paymentStatus, paymentId: payment.id, amount },
          reason: "Required advance bank transfer matched to the booking reference.",
        },
        {
          adminId: input.adminId,
          action: "BOOKING_CONFIRMED",
          targetType: "booking",
          targetId: booking.id,
          bookingId: booking.id,
          oldValue: { status: booking.status },
          newValue: { status: updated.status },
          reason: "Required advance payment received.",
        },
      ],
    })
    await enqueueBookingNotification(tx, {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      event: "CUSTOMER_BOOKING_CONFIRMED",
      payload: { amount, paymentId: payment.id },
    })
    return {
      bookingId: booking.id,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      amountReceived: amount,
      outstandingBalance: Math.max(financials.total - resultingNet, 0),
    }
  }, transactionOptions)
}

export async function recordRemainingBalance(input: { bookingId: string; adminId: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${input.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId }, include: bookingPaymentInclude })
    if (!booking) transitionError("BOOKING_NOT_FOUND", "Booking not found.")
    if (booking.status !== "CONFIRMED")
      transitionError("BOOKING_NOT_PAYABLE", "Only a confirmed booking can receive its pickup balance.")
    const financials = totals(booking)
    if (financials.outstanding <= 0) transitionError("NO_BALANCE_DUE", "There is no outstanding balance.")

    const now = new Date()
    const payment = await tx.payment.create({
      data: {
        bookingId: booking.id,
        amount: financials.outstanding,
        currency: (booking.pricingSnapshot?.currency || "EUR").toLowerCase(),
        status: "PAID",
        kind: "RECEIPT",
        purpose: financials.netReceived > 0 ? "BALANCE" : "FULL",
        method: "PAY_AT_PICKUP",
        receivedAt: now,
        recordedById: input.adminId,
        metadata: { source: "ADMIN_PICKUP_PAYMENT" },
      },
    })
    const updated = await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: "PAID" } })
    await tx.adminAuditLog.create({
      data: {
        adminId: input.adminId,
        action: "PAYMENT_RECEIVED",
        targetType: "booking",
        targetId: booking.id,
        bookingId: booking.id,
        oldValue: { paymentStatus: booking.paymentStatus },
        newValue: { paymentStatus: updated.paymentStatus, paymentId: payment.id, amount: financials.outstanding },
        reason: "Outstanding balance collected at vehicle pickup.",
      },
    })
    await enqueueBookingNotification(tx, {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      event: "CUSTOMER_BALANCE_RECEIPT",
      payload: { amount: financials.outstanding, paymentId: payment.id },
      eventKeySuffix: payment.id,
    })
    return {
      bookingId: booking.id,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      amountReceived: financials.outstanding,
      outstandingBalance: 0,
    }
  }, transactionOptions)
}

export async function cancelBookingWithReason(input: { bookingId: string; adminId: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${input.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId }, include: bookingPaymentInclude })
    if (!booking) transitionError("BOOKING_NOT_FOUND", "Booking not found.")
    if (!["PENDING", "CONFIRMED"].includes(booking.status))
      transitionError("BOOKING_NOT_CANCELLABLE", "Only pending or confirmed bookings can be cancelled.")
    const financials = totals(booking)
    const now = new Date()
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        paymentDueAt: null,
        refundReviewStatus: financials.netReceived > 0 ? "PENDING" : "NOT_REQUIRED",
      },
    })
    await tx.adminAuditLog.create({
      data: {
        adminId: input.adminId,
        action: "BOOKING_CANCELLED",
        targetType: "booking",
        targetId: booking.id,
        bookingId: booking.id,
        oldValue: { status: booking.status },
        newValue: { status: updated.status, refundReviewStatus: updated.refundReviewStatus },
        reason: input.reason,
      },
    })
    await enqueueBookingNotification(tx, {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      event: "CUSTOMER_BOOKING_CANCELLED",
      payload: { reason: input.reason, refundReviewRequired: financials.netReceived > 0 },
    })
    return { bookingId: booking.id, status: updated.status, refundReviewStatus: updated.refundReviewStatus }
  }, transactionOptions)
}

export async function recordBookingRefund(input: { bookingId: string; adminId: string; amount: number; reason: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${input.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId }, include: bookingPaymentInclude })
    if (!booking) transitionError("BOOKING_NOT_FOUND", "Booking not found.")
    if (!["CANCELLED", "REJECTED"].includes(booking.status))
      transitionError("REFUND_NOT_ALLOWED", "Refunds can only be recorded for cancelled or rejected bookings.")
    if (!Number.isInteger(input.amount) || input.amount <= 0)
      transitionError("REFUND_AMOUNT_INVALID", "Enter a positive refund amount in cents.")
    const financials = totals(booking)
    if (input.amount > financials.netReceived)
      transitionError("REFUND_AMOUNT_INVALID", "The refund cannot exceed the net amount received.")

    const now = new Date()
    const refund = await tx.payment.create({
      data: {
        bookingId: booking.id,
        amount: input.amount,
        currency: (booking.pricingSnapshot?.currency || "EUR").toLowerCase(),
        status: "REFUNDED",
        kind: "REFUND",
        purpose: "FULL",
        method: "TRANSFER",
        receivedAt: now,
        recordedById: input.adminId,
        reason: input.reason,
        metadata: { source: "ADMIN_MANUAL_REFUND" },
      },
    })
    const remainingNet = financials.netReceived - input.amount
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: remainingNet === 0 ? "REFUNDED" : "PARTIALLY_REFUNDED",
        refundReviewStatus: remainingNet === 0 ? "RESOLVED" : "PENDING",
      },
    })
    await tx.adminAuditLog.create({
      data: {
        adminId: input.adminId,
        action: "PAYMENT_REFUNDED",
        targetType: "booking",
        targetId: booking.id,
        bookingId: booking.id,
        oldValue: { paymentStatus: booking.paymentStatus, netReceived: financials.netReceived },
        newValue: { paymentStatus: updated.paymentStatus, refundId: refund.id, amount: input.amount, netReceived: remainingNet },
        reason: input.reason,
      },
    })
    await enqueueBookingNotification(tx, {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      event: "CUSTOMER_REFUND_CONFIRMED",
      payload: { amount: input.amount, refundId: refund.id },
      eventKeySuffix: refund.id,
    })
    return { bookingId: booking.id, amountRefunded: input.amount, paymentStatus: updated.paymentStatus, refundReviewStatus: updated.refundReviewStatus }
  }, transactionOptions)
}

export async function closeRefundReviewWithoutRefund(input: { bookingId: string; adminId: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${input.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } })
    if (!booking) transitionError("BOOKING_NOT_FOUND", "Booking not found.")
    if (!["CANCELLED", "REJECTED"].includes(booking.status) || booking.refundReviewStatus !== "PENDING")
      transitionError("REFUND_REVIEW_INVALID", "This booking does not have an open refund review.")
    const updated = await tx.booking.update({ where: { id: booking.id }, data: { refundReviewStatus: "RESOLVED" } })
    await tx.adminAuditLog.create({
      data: {
        adminId: input.adminId,
        action: "REFUND_REVIEW_RESOLVED",
        targetType: "booking",
        targetId: booking.id,
        bookingId: booking.id,
        oldValue: { refundReviewStatus: booking.refundReviewStatus },
        newValue: { refundReviewStatus: updated.refundReviewStatus },
        reason: input.reason,
      },
    })
    return { bookingId: booking.id, refundReviewStatus: updated.refundReviewStatus }
  }, transactionOptions)
}

// Compatibility exports for existing admin call sites while the UI migrates to the generic labels.
export const confirmTransferDeposit = recordAdvancePayment
export const recordPickupPayment = recordRemainingBalance
