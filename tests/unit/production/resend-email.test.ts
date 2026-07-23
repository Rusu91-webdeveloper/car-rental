import { beforeEach, describe, expect, it, vi } from "vitest"

const smtpSend = vi.hoisted(() => vi.fn())
const logError = vi.hoisted(() => vi.fn())

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail: smtpSend }),
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

describe("Gmail SMTP production email", () => {
  beforeEach(() => {
    vi.resetModules()
    smtpSend.mockReset()
    logError.mockReset()
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_USER
    delete process.env.EMAIL_PASS
    process.env.GMAIL_SMTP_USER = "bookings@example.invalid"
    process.env.GMAIL_SMTP_APP_PASSWORD = "abcdefghijklmnop"
    process.env.EMAIL_FROM = "Synthetic Rentals <bookings@example.invalid>"
  })

  it("delivers configured offline instructions through the Gmail SMTP sender", async () => {
    smtpSend.mockResolvedValue({ messageId: "synthetic-message" })
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
    expect(smtpSend).toHaveBeenCalledOnce()
    const message = smtpSend.mock.calls[0][0]
    expect(message.from).toBe("Synthetic Rentals <bookings@example.invalid>")
    expect(message.html).toContain("Use reference &lt;SYNTHETIC-BOOKING&gt;.")
    expect(message.html).toContain("Bank Transfer")
    expect(message.messageId).toMatch(/^<[a-f0-9]{64}@example\.invalid>$/)
  })

  it("returns a stable failure without leaking provider details", async () => {
    smtpSend.mockRejectedValue(new Error("provider-secret-detail"))
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

  it("delivers contact messages to the owner with safe HTML and reply routing", async () => {
    smtpSend.mockResolvedValue({ messageId: "synthetic-contact" })
    const { sendContactMessageEmail } = await import("@/lib/email")
    const result = await sendContactMessageEmail({
      to: ["owner@example.invalid"],
      name: "Visitor <script>",
      email: "visitor@example.invalid",
      subject: "Rental & availability",
      message: "Please check <b>tomorrow</b>.",
      locale: "en",
    })

    expect(result).toEqual({ id: "synthetic-contact" })
    const message = smtpSend.mock.calls[0][0]
    expect(message.to).toEqual(["owner@example.invalid"])
    expect(message.replyTo).toBe("visitor@example.invalid")
    expect(message.subject).toBe("[Kontakt] Rental & availability")
    expect(message.html).toContain("Visitor &lt;script&gt;")
    expect(message.html).toContain("Rental &amp; availability")
    expect(message.html).toContain("Please check &lt;b&gt;tomorrow&lt;/b&gt;.")
    expect(message.html).not.toContain("<script>")
  })

  it("acknowledges a contact enquiry in the selected customer language", async () => {
    smtpSend.mockResolvedValue({ messageId: "synthetic-ack" })
    const { sendContactAcknowledgementEmail } = await import("@/lib/email")
    await sendContactAcknowledgementEmail({
      to: "visitor@example.invalid",
      name: "Erika <Mustermann>",
      subject: "Mietwagen",
      locale: "de",
      idempotencyKey: "contact-customer-synthetic",
    })

    const message = smtpSend.mock.calls[0][0]
    expect(message.subject).toContain("Wir haben Ihre Nachricht erhalten")
    expect(message.html).toContain("Vielen Dank für Ihre Nachricht")
    expect(message.html).toContain("Erika &lt;Mustermann&gt;")
    expect(message.messageId).toMatch(/^<[a-f0-9]{64}@example\.invalid>$/)
  })

  it("sends document submission and replacement emails with stable event keys", async () => {
    smtpSend.mockResolvedValue({ messageId: "synthetic-application" })
    const { sendBookingApplicationSubmittedEmail, sendDocumentReviewDecisionEmail } = await import("@/lib/email")
    const common = {
      applicationId: "application-1",
      to: "driver@example.invalid",
      userName: "Erika Mustermann",
      carName: "Testfahrzeug",
      pickupDate: "01.08.2026, 10:00",
      returnDate: "03.08.2026, 10:00",
      location: "Berlin",
      locale: "de" as const,
    }

    await sendBookingApplicationSubmittedEmail({
      ...common,
      idempotencyKey: "application-submitted-customer-1-8",
    })
    await sendDocumentReviewDecisionEmail({
      ...common,
      decision: "REPLACEMENT_REQUIRED",
      documentName: "Führerschein",
      reason: "Die Rückseite ist nicht lesbar.",
      idempotencyKey: "document-review-1-replacement-2",
    })

    expect(smtpSend).toHaveBeenCalledTimes(2)
    expect(smtpSend.mock.calls[0][0].html).toContain("Unterlagen erfolgreich eingereicht")
    expect(smtpSend.mock.calls[1][0].html).toContain("Dokument ersetzen")
    expect(smtpSend.mock.calls[1][0].html).toContain("Die Rückseite ist nicht lesbar.")
    expect(smtpSend.mock.calls[1][0].messageId).toMatch(/^<[a-f0-9]{64}@example\.invalid>$/)
  })
})
