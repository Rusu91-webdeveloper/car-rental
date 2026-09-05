import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { paymentConfigurationSchema } from "@/lib/business-configuration/schema"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("booking confirmation and offline payment instructions", () => {
  it("routes lifecycle delivery through the durable Gmail notification outbox", () => {
    const action = read("app/actions/bookings.ts")
    const email = read("lib/email.tsx")
    const outbox = read("lib/booking-notifications.ts")
    const packageJson = read("package.json")
    expect(action).toContain("recordAdvancePaymentTransition")
    expect(action).toContain("retryBookingNotification")
    expect(action).not.toContain("sendBookingConfirmationEmail(")
    expect(outbox).toContain("dispatchBookingNotification")
    expect(outbox).toContain("CUSTOMER_TRANSFER_INSTRUCTIONS")
    expect(outbox).toContain("CUSTOMER_TRANSFER_CONFIRMED")
    expect(outbox).toContain("CUSTOMER_ADVANCE_INSTRUCTIONS")
    expect(outbox).toContain("CUSTOMER_REFUND_CONFIRMED")
    expect(email).toContain('from "nodemailer"')
    expect(email).not.toContain('from "resend"')
    expect(email).toContain("GMAIL_SMTP_USER")
    expect(packageJson).toContain('"nodemailer"')
    expect(packageJson).not.toContain('"resend"')
  })

  it("uses versioned application snapshots for payment and confirmation content", () => {
    const resolver = read("lib/booking-confirmation-configuration.ts")
    expect(resolver).toContain("bookingApplication.findFirst")
    expect(resolver).toContain("paymentSelection")
    expect(resolver).toContain("confirmationConfig")
    expect(resolver).toContain('sectionDefinition.key === "PAYMENT"')
  })

  it("limits the editor to bank transfer and payment at pickup", () => {
    const service = read("lib/notification-configuration/service.ts")
    const form = read("components/business-configuration/notification-configuration-form.tsx")
    expect(service).toContain('["BANK_TRANSFER", "CASH_ON_PICKUP"]')
    expect(form).not.toContain('method: "BOOKING_REQUEST"')
    expect(form).not.toContain("ONLINE_DEPOSIT")
    expect(form).not.toContain("ONLINE_FULL")
    expect(form).not.toContain("CARD_ON_PICKUP")
  })

  it("allows zero percent to disable the booking deposit", () => {
    const action = read("app/actions/notification-configuration.ts")
    const form = read("components/business-configuration/notification-configuration-form.tsx")
    const service = read("lib/notification-configuration/service.ts")
    expect(action).toContain("depositPercentage: z.number().int().min(0).max(100)")
    expect(form).toContain("Set this to 0% to disable the booking deposit.")
    expect(service).toContain("resolveOwnerDepositPolicy(input)")
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
