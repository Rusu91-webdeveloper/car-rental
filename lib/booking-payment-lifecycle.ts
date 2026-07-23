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

export async function confirmTransferDeposit(input: { bookingId: string; adminId: string }) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${input.bookingId} FOR UPDATE`
      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        include: { pricingSnapshot: true },
      })
      if (!booking) transitionError("BOOKING_NOT_FOUND", "Booking not found.")
      if (booking.paymentMethod !== "TRANSFER")
        transitionError("PAYMENT_METHOD_INVALID", "This booking does not use bank transfer.")
      if (["CANCELLED", "REJECTED", "COMPLETED"].includes(booking.status))
        transitionError("BOOKING_NOT_PAYABLE", "This booking can no longer receive a deposit.")
      if (booking.paymentStatus !== "PENDING")
        transitionError("PAYMENT_ALREADY_RECORDED", "The transfer payment has already been recorded.")
      if (booking.status === "PENDING" && booking.paymentDueAt && booking.paymentDueAt <= new Date())
        transitionError("PAYMENT_WINDOW_EXPIRED", "The 24-hour payment window has expired.")

      const total = booking.pricingSnapshot?.grandTotal ?? booking.totalPrice
      const amount = booking.depositAmount > 0 ? Math.min(booking.depositAmount, total) : total
      const fullyPaid = amount >= total
      const now = new Date()
      const payment = await tx.payment.create({
        data: {
          bookingId: booking.id,
          amount,
          currency: (booking.pricingSnapshot?.currency || "EUR").toLowerCase(),
          status: "PAID",
          purpose: fullyPaid ? "FULL" : "DEPOSIT",
          method: "TRANSFER",
          receivedAt: now,
          recordedById: input.adminId,
          metadata: { source: "ADMIN_BANK_VERIFICATION", transferCode: booking.transferCode },
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
            reason: "Bank transfer matched to the booking reference.",
          },
          {
            adminId: input.adminId,
            action: "BOOKING_CONFIRMED",
            targetType: "booking",
            targetId: booking.id,
            bookingId: booking.id,
            oldValue: { status: booking.status },
            newValue: { status: updated.status },
            reason: "Configured transfer amount received.",
          },
        ],
      })
      await enqueueBookingNotification(tx, {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        event: "CUSTOMER_TRANSFER_CONFIRMED",
      })
      return {
        bookingId: booking.id,
        status: updated.status,
        paymentStatus: updated.paymentStatus,
        amountReceived: amount,
        outstandingBalance: Math.max(total - amount, 0),
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 },
  )
}

export async function recordPickupPayment(input: { bookingId: string; adminId: string }) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${input.bookingId} FOR UPDATE`
      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        include: {
          pricingSnapshot: true,
          payments: { where: { status: "PAID" }, select: { amount: true } },
        },
      })
      if (!booking) transitionError("BOOKING_NOT_FOUND", "Booking not found.")
      if (booking.paymentMethod !== "PAY_AT_PICKUP")
        transitionError("PAYMENT_METHOD_INVALID", "This booking is not payable at pickup.")
      if (["CANCELLED", "REJECTED"].includes(booking.status))
        transitionError("BOOKING_NOT_PAYABLE", "This booking can no longer receive payment.")
      if (booking.paymentStatus === "PAID")
        transitionError("PAYMENT_ALREADY_RECORDED", "Payment has already been recorded.")

      const total = booking.pricingSnapshot?.grandTotal ?? booking.totalPrice
      const received = booking.payments.reduce((sum, payment) => sum + payment.amount, 0)
      const amount = Math.max(total - received, 0)
      if (amount <= 0) transitionError("NO_BALANCE_DUE", "There is no outstanding balance.")
      const now = new Date()
      const payment = await tx.payment.create({
        data: {
          bookingId: booking.id,
          amount,
          currency: (booking.pricingSnapshot?.currency || "EUR").toLowerCase(),
          status: "PAID",
          purpose: received > 0 ? "BALANCE" : "FULL",
          method: "PAY_AT_PICKUP",
          receivedAt: now,
          recordedById: input.adminId,
          metadata: { source: "ADMIN_PICKUP_PAYMENT" },
        },
      })
      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: "PAID" },
      })
      await tx.adminAuditLog.create({
        data: {
          adminId: input.adminId,
          action: "PAYMENT_RECEIVED",
          targetType: "booking",
          targetId: booking.id,
          bookingId: booking.id,
          oldValue: { paymentStatus: booking.paymentStatus },
          newValue: { paymentStatus: updated.paymentStatus, paymentId: payment.id, amount },
          reason: "Payment collected at vehicle pickup.",
        },
      })
      return {
        bookingId: booking.id,
        status: updated.status,
        paymentStatus: updated.paymentStatus,
        amountReceived: amount,
        outstandingBalance: 0,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 },
  )
}
