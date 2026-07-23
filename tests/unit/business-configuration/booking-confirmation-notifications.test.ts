import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { paymentConfigurationSchema } from "@/lib/business-configuration/schema"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("booking confirmation and offline payment instructions", () => {
  it("routes confirmed-status delivery through the idempotent customer and admin delivery service", () => {
    const action = read("app/actions/bookings.ts")
    const email = read("lib/email.tsx")
    const packageJson = read("package.json")
    expect(action).toContain("deliverBookingConfirmation")
    expect(action).toContain('validated.status === "CONFIRMED" && booking.status !== "CONFIRMED"')
    expect(action).not.toContain("sendBookingConfirmationEmail(")
    expect(email).toContain('from "resend"')
    expect(email).not.toContain("nodemailer")
    expect(email).not.toContain("EMAIL_HOST")
    expect(packageJson).not.toContain('"nodemailer"')
  })

  it("uses versioned application snapshots for payment and confirmation content", () => {
    const resolver = read("lib/booking-confirmation-configuration.ts")
    expect(resolver).toContain("bookingApplication.findFirst")
    expect(resolver).toContain("paymentSelection")
    expect(resolver).toContain("confirmationConfig")
    expect(resolver).toContain('sectionDefinition.key === "PAYMENT"')
  })

  it("limits the editor to the three required offline instruction modes", () => {
    const service = read("lib/notification-configuration/service.ts")
    const form = read("components/business-configuration/notification-configuration-form.tsx")
    expect(service).toContain('["BOOKING_REQUEST", "BANK_TRANSFER", "CASH_ON_PICKUP"]')
    expect(form).not.toContain("ONLINE_DEPOSIT")
    expect(form).not.toContain("ONLINE_FULL")
    expect(form).not.toContain("CARD_ON_PICKUP")
  })

  it("requires method-specific instructions for every enabled method", () => {
    const parsed = paymentConfigurationSchema.safeParse({
      defaultMethod: "BANK_TRANSFER",
      confirmationMode: "REQUIRES_REVIEW",
      depositMode: "NONE",
      depositValue: 0,
      remainingBalanceRule: "NOT_APPLICABLE",
      methods: [
        { method: "BANK_TRANSFER", enabled: true },
        { method: "CASH_ON_PICKUP", enabled: true },
      ],
      instructions: [
        {
          method: "BANK_TRANSFER",
          locale: "en",
          instructions: "Use the reference.",
        },
      ],
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues.some(({ message }) => message.includes("payments.instructions_required"))).toBe(true)
  })

  it("migrates legacy instructions to their version default method", () => {
    const migration = read("prisma/migrations/20260714150000_add_method_specific_payment_instructions/migration.sql")
    expect(migration).toContain('SET "method" = config."defaultMethod"')
    expect(migration).toContain('ALTER COLUMN "method" SET NOT NULL')
    expect(migration).toContain('("paymentConfigVersionId", "method", "locale")')
  })

  it("does not extend a draft that lost a concurrent activation race", () => {
    const service = read("lib/notification-configuration/service.ts")
    expect(service).toContain("latestDraft.supersedesReleaseId === active.id")
    expect(service).toContain("const base = draft ?? active")
  })
})
