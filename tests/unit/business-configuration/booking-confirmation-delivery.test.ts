import { beforeEach, describe, expect, it, vi } from "vitest"

const findBooking = vi.hoisted(() => vi.fn())
const sendConfirmation = vi.hoisted(() => vi.fn())
const loadConfiguration = vi.hoisted(() => vi.fn())

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: { booking: { findUnique: findBooking } },
}))
vi.mock("@/lib/email", () => ({
  sendBookingConfirmationEmail: sendConfirmation,
}))
vi.mock("@/lib/booking-confirmation-configuration", () => ({
  loadBookingConfirmationConfiguration: loadConfiguration,
}))

describe("booking confirmation delivery", () => {
  beforeEach(() => {
    findBooking.mockReset()
    sendConfirmation.mockReset()
    loadConfiguration.mockReset()
    loadConfiguration.mockResolvedValue({ showPaymentInstructions: false })
    sendConfirmation.mockResolvedValue({ success: true, id: "message-1" })
    findBooking.mockResolvedValue({
      id: "booking-1",
      bookingNumber: "BK-100",
      locale: "de",
      pickupDate: new Date("2026-08-01T08:00:00.000Z"),
      dropoffDate: new Date("2026-08-03T08:00:00.000Z"),
      location: "Berlin Hauptbahnhof",
      totalPrice: 24000,
      guaranteeAmount: 5000,
      transferCode: "TRANSFER-1",
      paymentMethod: "TRANSFER",
      user: { name: "Account Holder", email: "account@example.invalid" },
      car: { name: "Test Car", nameDe: "Testfahrzeug" },
      pricingSnapshot: { grandTotal: 26000, currency: "EUR" },
      customerDriverSnapshot: {
        firstName: "Erika",
        lastName: "Mustermann",
        email: "driver@example.invalid",
      },
      legalAcceptances: [],
    })
  })

  it("sends the approved booking to the driver's saved email", async () => {
    const { deliverBookingConfirmation } = await import("@/lib/booking-confirmation-delivery")
    const result = await deliverBookingConfirmation("booking-1")

    expect(result).toMatchObject({ success: true, customerEmail: "driver@example.invalid" })
    expect(sendConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      to: "driver@example.invalid",
      userName: "Erika Mustermann",
      carName: "Testfahrzeug",
      totalPrice: 26000,
      bookingNumber: "BK-100",
      locale: "de",
      idempotencyKey: undefined,
    }))
  })

  it("uses a fresh idempotency key for an intentional admin resend", async () => {
    const { deliverBookingConfirmation } = await import("@/lib/booking-confirmation-delivery")
    await deliverBookingConfirmation("booking-1", { manualResend: true })

    expect(sendConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: expect.stringMatching(/^booking-confirmation-BK-100-manual-\d+$/),
    }))
  })
})
