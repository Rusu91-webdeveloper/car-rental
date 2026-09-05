import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { checkoutDateTimeLocal, checkoutTimeParam } from "@/lib/checkout-date-time"

describe("checkout date and time query state", () => {
  it("preserves independent pickup and drop-off times", () => {
    expect(checkoutDateTimeLocal("2026-08-01", "10:00")).toBe("2026-08-01T10:00")
    expect(checkoutDateTimeLocal("2026-08-03", "12:00")).toBe("2026-08-03T12:00")
  })

  it("keeps date-only search links compatible with the 10:00 default", () => {
    expect(checkoutDateTimeLocal("2026-08-01", null)).toBe("2026-08-01T10:00")
  })

  it("rejects invalid time parameters without allowing an invalid wall time", () => {
    expect(checkoutDateTimeLocal("2026-08-03", "25:90")).toBe("2026-08-03T10:00")
    expect(checkoutDateTimeLocal("not-a-date", "12:00")).toBe("")
  })

  it("serializes the exact selected time for the checkout URL", () => {
    const value = new Date(2026, 7, 3, 12, 30)
    expect(checkoutTimeParam(value)).toBe("12:30")
  })

  it("round-trips both selected times through checkout navigation", () => {
    const checkout = readFileSync(
      resolve(process.cwd(), "app/[locale]/checkout/[id]/checkout-client.tsx"),
      "utf8",
    )

    expect(checkout).toContain('searchParams.get("pickupTime")')
    expect(checkout).toContain('searchParams.get("dropoffTime")')
    expect(checkout).toContain("pickupTime: checkoutTimeParam(nextPickup)")
    expect(checkout).toContain("dropoffTime: checkoutTimeParam(nextDropoff)")
    expect(checkout).toContain("pickupDate: pickup.toISOString()")
    expect(checkout).toContain("dropoffDate: dropoff.toISOString()")
    expect(checkout).toContain('locale: locale === "de" ? "de" : "en"')

    const bookingActions = readFileSync(
      resolve(process.cwd(), "app/actions/bookings.ts"),
      "utf8",
    )
    expect(bookingActions).toContain('locale: z.enum(["en", "de"]).default("en")')
    expect(bookingActions).toContain("locale: validated.locale")
    expect(bookingActions).not.toContain('locale: "en",\n      insuranceSelected: validated.insuranceSelected')
  })

  it("shows the billing floor without presenting it as a mandatory 48-hour rental", () => {
    const checkout = readFileSync(
      resolve(process.cwd(), "app/[locale]/checkout/[id]/checkout-client.tsx"),
      "utf8",
    )
    const ownerRules = readFileSync(
      resolve(process.cwd(), "components/business-configuration/billing-rule-form.tsx"),
      "utf8",
    )

    expect(checkout).toContain("bookingConfiguration.minimumChargeDays")
    expect(checkout).toContain("Earlier returns are allowed")
    expect(ownerRules).toContain("Minimum charged days")
    expect(ownerRules).toContain("minimumRentalMinutes: 1")
    expect(ownerRules).not.toContain("minimumRentalMinutes: safeDays * 1_440")
  })
})
