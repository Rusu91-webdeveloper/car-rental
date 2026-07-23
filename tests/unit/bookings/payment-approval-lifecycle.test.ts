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
      totalPrice: 26000,
      pricingSnapshot: { grandTotal: 26000, currency: "EUR" },
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
    expect(enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({ event: "CUSTOMER_TRANSFER_CONFIRMED" }))
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
      payments: [{ amount: 2000 }],
    })
    tx.booking.update.mockResolvedValue({ status: "CONFIRMED", paymentStatus: "PAID" })

    const { recordPickupPayment } = await import("@/lib/booking-payment-lifecycle")
    const result = await recordPickupPayment({ bookingId: "booking-2", adminId: "admin-1" })

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 18000, purpose: "BALANCE", method: "PAY_AT_PICKUP" }),
    })
    expect(result).toMatchObject({ paymentStatus: "PAID", amountReceived: 18000, outstandingBalance: 0 })
  })
})
