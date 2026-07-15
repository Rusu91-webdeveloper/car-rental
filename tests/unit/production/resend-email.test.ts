import { beforeEach, describe, expect, it, vi } from "vitest"

const resendSend = vi.hoisted(() => vi.fn())
const logError = vi.hoisted(() => vi.fn())

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend }
  },
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    companySettings: {
      findUnique: vi.fn(async () => ({
        companyName: "Synthetic Rentals",
        companyEmail: "support@example.invalid",
        supportEmail: "support@example.invalid",
      })),
    },
  },
}))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: logError },
}))

describe("Resend-only production email", () => {
  beforeEach(() => {
    vi.resetModules()
    resendSend.mockReset()
    logError.mockReset()
    process.env.RESEND_API_KEY = "re_synthetic"
    process.env.EMAIL_FROM = "Synthetic Rentals <bookings@example.invalid>"
  })

  it("delivers configured offline instructions through the single Resend sender", async () => {
    resendSend.mockResolvedValue({ data: { id: "synthetic-message" }, error: null })
    const { sendBookingConfirmationEmail } = await import("@/lib/email")
    const result = await sendBookingConfirmationEmail({
      to: "customer@example.invalid",
      userName: "Synthetic Customer",
      carName: "Synthetic Vehicle",
      pickupDate: "2026-08-01",
      dropoffDate: "2026-08-02",
      location: "Synthetic Location",
      totalPrice: 12500,
      bookingNumber: "SYNTHETIC-BOOKING",
      locale: "en",
      paymentMode: "BANK_TRANSFER",
      paymentInstructions: "Use reference <SYNTHETIC-BOOKING>.",
      showPaymentInstructions: true,
      confirmationHeading: "Booking confirmed",
      confirmationContent: "Keep this confirmation.",
    })

    expect(result).toEqual({ success: true, id: "synthetic-message" })
    expect(resendSend).toHaveBeenCalledOnce()
    const message = resendSend.mock.calls[0][0]
    expect(message.from).toBe("Synthetic Rentals <bookings@example.invalid>")
    expect(message.html).toContain("Use reference &lt;SYNTHETIC-BOOKING&gt;.")
    expect(message.html).toContain("Bank Transfer")
  })

  it("returns a stable failure without leaking provider details", async () => {
    resendSend.mockResolvedValue({ data: null, error: { message: "provider-secret-detail" } })
    const { sendBookingConfirmationEmail } = await import("@/lib/email")
    const result = await sendBookingConfirmationEmail({
      to: "customer@example.invalid",
      userName: "Synthetic Customer",
      carName: "Synthetic Vehicle",
      pickupDate: "2026-08-01",
      dropoffDate: "2026-08-02",
      location: "Synthetic Location",
      totalPrice: 12500,
      bookingNumber: "SYNTHETIC-BOOKING",
    })

    expect(result).toEqual({ error: "Email delivery failed" })
    expect(JSON.stringify(result)).not.toContain("provider-secret-detail")
    expect(logError).toHaveBeenCalledWith("email.operation_failed")
  })
})
