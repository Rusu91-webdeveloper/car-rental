import { describe, expect, it } from "vitest"
import { contactMessageSchema } from "@/lib/contact"

describe("public contact message validation", () => {
  it("accepts a bounded German contact message", () => {
    expect(contactMessageSchema.safeParse({
      name: "Erika Musterfrau",
      email: "erika@example.invalid",
      subject: "Frage zur Buchung",
      message: "Ich habe eine Frage zu meinem Mietzeitraum.",
      website: "",
      locale: "de",
    }).success).toBe(true)
  })

  it("rejects malformed and oversized input", () => {
    expect(contactMessageSchema.safeParse({ name: "A", email: "not-an-email", subject: "x", message: "short" }).success).toBe(false)
    expect(contactMessageSchema.safeParse({ name: "Valid Name", email: "valid@example.invalid", subject: "Valid subject", message: "x".repeat(5_001) }).success).toBe(false)
  })

  it("allows a bounded honeypot value so the server can silently discard bots", () => {
    const parsed = contactMessageSchema.safeParse({
      name: "Bot Name",
      email: "bot@example.invalid",
      subject: "Bot subject",
      message: "Automated message body",
      website: "https://spam.example.invalid",
      locale: "en",
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.website).not.toBe("")
  })
})
