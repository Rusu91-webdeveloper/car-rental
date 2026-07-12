import { describe, expect, it } from "vitest"
import { quoteLegacyPricing } from "@/lib/pricing/legacy-adapter"

function legacyFormula(input: {
  pickupAt: Date
  returnAt: Date
  dailyRate: number
  taxRate: number
  taxIncluded: boolean
  depositPercentage: number
  guaranteePercentage: number
  paymentMethod: "TRANSFER" | "PAY_AT_PICKUP"
}) {
  const days = Math.max(1, Math.ceil(Math.abs(input.returnAt.getTime() - input.pickupAt.getTime()) / 86_400_000))
  const subtotal = input.dailyRate * days
  const effectiveTaxRate = input.taxRate > 0 ? input.taxRate : 0.1
  const tax = input.taxIncluded ? 0 : Math.round(subtotal * effectiveTaxRate)
  const total = subtotal + tax
  return {
    days,
    subtotal,
    tax,
    total,
    deposit: input.paymentMethod === "TRANSFER" ? Math.round(total * input.depositPercentage) : 0,
    guarantee: Math.round(total * input.guaranteePercentage),
  }
}

describe("legacy pricing characterization", () => {
  it.each([
    ["one hour", "2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z", 12_345, 0, false, 0.2, 0, "TRANSFER"],
    ["exact day", "2026-01-01T10:00:00Z", "2026-01-02T10:00:00Z", 9_999, 0.19, false, 0.25, 0.3, "TRANSFER"],
    ["partial second day", "2026-01-01T10:00:00Z", "2026-01-02T10:01:00Z", 8_000, 0.19, true, 0.2, 0.1, "PAY_AT_PICKUP"],
    ["ten days", "2026-01-01T10:00:00Z", "2026-01-11T10:00:00Z", 7_500, 0.07, false, 0.5, 0, "TRANSFER"],
  ] as const)("matches current server arithmetic: %s", async (_label, pickup, returned, dailyRate, taxRate, taxIncluded, deposit, guarantee, paymentMethod) => {
    const pickupAt = new Date(pickup)
    const returnAt = new Date(returned)
    const expected = legacyFormula({ pickupAt, returnAt, dailyRate, taxRate, taxIncluded, depositPercentage: deposit, guaranteePercentage: guarantee, paymentMethod })
    const quote = await quoteLegacyPricing({
      vehicleId: "car-1",
      pickupAt,
      returnAt,
      carPriceMinorUnits: dailyRate,
      currency: "EUR",
      taxRate,
      taxIncluded,
      depositPercentage: deposit,
      guaranteePercentage: guarantee,
      paymentMethod,
      calculatedAt: new Date("2026-01-01T00:00:00Z"),
    })
    expect(quote.chargeableDuration.chargeableDays).toBe(expected.days)
    expect(quote.baseSubtotal).toBe(expected.subtotal)
    expect(quote.taxSubtotal).toBe(expected.tax)
    expect(quote.grandTotal).toBe(expected.total)
    expect(quote.payment.depositAmount).toBe(expected.deposit)
    expect(quote.payment.guaranteeAmount).toBe(expected.guarantee)
  })

  it("records rather than silently fixes the existing 10% fallback", async () => {
    const quote = await quoteLegacyPricing({
      vehicleId: "car-1",
      pickupAt: new Date("2026-01-01T00:00:00Z"),
      returnAt: new Date("2026-01-02T00:00:00Z"),
      carPriceMinorUnits: 10_000,
      taxRate: 0,
      taxIncluded: false,
    })
    expect(quote.taxSubtotal).toBe(1_000)
    expect(quote.warnings).toContain("Compatibility mode preserves the existing unconfigured 10% tax fallback.")
  })
})
