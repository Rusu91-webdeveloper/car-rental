import { beforeEach, describe, expect, it, vi } from "vitest"

const transaction = vi.hoisted(() => vi.fn())
const enqueue = vi.hoisted(() => vi.fn())
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  booking: { findUnique: vi.fn(), update: vi.fn() },
  payment: { create: vi.fn() },
  adminAuditLog: { create: vi.fn(), createMany: vi.fn() },
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ prisma: { $transaction: transaction } }))
vi.mock("@/lib/booking-notifications", () => ({ enqueueBookingNotification: enqueue }))

describe("payment approval lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transaction.mockImplementation(async (operation: (client: typeof tx) => unknown) => operation(tx))
    tx.payment.create.mockResolvedValue({ id: "payment-1" })
    tx.adminAuditLog.create.mockResolvedValue({ id: "audit-1" })
    tx.adminAuditLog.createMany.mockResolvedValue({ count: 2 })
    enqueue.mockResolvedValue({ id: "notification-1" })
  })

  it("records only the configured transfer deposit and confirms the booking", async () => {
    tx.booking.findUnique.mockResolvedValue({
      id: "booking-1",
      bookingNumber: "BK-1",
      transferCode: "REF-1",
      paymentMethod: "TRANSFER",
      paymentStatus: "PENDING",
      status: "PENDING",
      paymentDueAt: new Date(Date.now() + 60_000),
      confirmedAt: null,
      depositAmount: 2600,
      advancePaymentAmount: 2600,
      totalPrice: 26000,
      pricingSnapshot: { grandTotal: 26000, currency: "EUR" },
      payments: [],
    })
    tx.booking.update.mockResolvedValue({ status: "CONFIRMED", paymentStatus: "DEPOSIT_PAID" })

    const { confirmTransferDeposit } = await import("@/lib/booking-payment-lifecycle")
    const result = await confirmTransferDeposit({ bookingId: "booking-1", adminId: "admin-1" })

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 2600,
        purpose: "DEPOSIT",
        method: "TRANSFER",
        status: "PAID",
      }),
    })
    expect(tx.booking.update).toHaveBeenCalledWith({
      where: { id: "booking-1" },
      data: expect.objectContaining({ status: "CONFIRMED", paymentStatus: "DEPOSIT_PAID", paymentDueAt: null }),
    })
    expect(enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({ event: "CUSTOMER_BOOKING_CONFIRMED" }))
    expect(result).toMatchObject({ status: "CONFIRMED", paymentStatus: "DEPOSIT_PAID", outstandingBalance: 23400 })
  })

  it("records the outstanding cash amount without inventing prior revenue", async () => {
    tx.booking.findUnique.mockResolvedValue({
      id: "booking-2",
      bookingNumber: "BK-2",
      paymentMethod: "PAY_AT_PICKUP",
      paymentStatus: "PENDING",
      status: "CONFIRMED",
      totalPrice: 18000,
      pricingSnapshot: { grandTotal: 20000, currency: "EUR" },
      payments: [{ amount: 2000, kind: "RECEIPT", status: "PAID" }],
    })
    tx.booking.update.mockResolvedValue({ status: "CONFIRMED", paymentStatus: "PAID" })

    const { recordPickupPayment } = await import("@/lib/booking-payment-lifecycle")
    const result = await recordPickupPayment({ bookingId: "booking-2", adminId: "admin-1" })

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 18000, purpose: "BALANCE", method: "PAY_AT_PICKUP" }),
    })
    expect(result).toMatchObject({ paymentStatus: "PAID", amountReceived: 18000, outstandingBalance: 0 })
  })

  it("uses a bank-transfer advance for payment-at-pickup bookings with a deposit", async () => {
    tx.booking.findUnique.mockResolvedValue({
      id: "booking-3",
      bookingNumber: "BK-3",
      transferCode: "REF-3",
      paymentMethod: "PAY_AT_PICKUP",
      paymentStatus: "PENDING",
      status: "PENDING",
      paymentDueAt: new Date(Date.now() + 60_000),
      confirmedAt: null,
      depositAmount: 4000,
      advancePaymentAmount: 4000,
      totalPrice: 20000,
      pricingSnapshot: { grandTotal: 20000, currency: "EUR" },
      payments: [],
    })
    tx.booking.update.mockResolvedValue({ status: "CONFIRMED", paymentStatus: "DEPOSIT_PAID" })

    const { recordAdvancePayment } = await import("@/lib/booking-payment-lifecycle")
    await recordAdvancePayment({ bookingId: "booking-3", adminId: "admin-1" })

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 4000, method: "TRANSFER", purpose: "DEPOSIT", kind: "RECEIPT" }),
    })
  })

  it("records externally completed refunds without moving money in-app", async () => {
    tx.booking.findUnique.mockResolvedValue({
      id: "booking-4",
      bookingNumber: "BK-4",
      paymentMethod: "TRANSFER",
      paymentStatus: "DEPOSIT_PAID",
      refundReviewStatus: "PENDING",
      status: "CANCELLED",
      totalPrice: 20000,
      pricingSnapshot: { grandTotal: 20000, currency: "EUR" },
      payments: [{ amount: 5000, kind: "RECEIPT", status: "PAID" }],
    })
    tx.booking.update.mockResolvedValue({ paymentStatus: "REFUNDED", refundReviewStatus: "RESOLVED" })

    const { recordBookingRefund } = await import("@/lib/booking-payment-lifecycle")
    const result = await recordBookingRefund({ bookingId: "booking-4", adminId: "admin-1", amount: 5000, reason: "Customer cancellation" })

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 5000, kind: "REFUND", status: "REFUNDED", reason: "Customer cancellation" }),
    })
    expect(result).toMatchObject({ amountRefunded: 5000, paymentStatus: "REFUNDED", refundReviewStatus: "RESOLVED" })
  })
})
