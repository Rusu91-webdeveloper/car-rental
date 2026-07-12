import { describe, expect, it } from "vitest"
import { calculatePricing } from "@/lib/pricing/engine"
import { money } from "@/lib/pricing/money"
import type { PricingRequest } from "@/lib/pricing/types"

const request = (overrides: Partial<PricingRequest> = {}): PricingRequest => ({
  vehicleId: "car-1",
  pickupAt: new Date("2026-01-01T00:00:00Z"),
  returnAt: new Date("2026-01-11T00:00:00Z"),
  businessTimeZone: "UTC",
  rates: {
    daily: money(8_000, "EUR"),
    weekly: money(50_000, "EUR"),
    monthly: money(180_000, "EUR"),
    weeklyEnabled: true,
    monthlyEnabled: true,
  },
  strategy: "ORDERED_PERIODS",
  persistentStrategy: "LONGEST_BLOCKS_THEN_DAYS",
  monthDefinition: "FIXED_30_DAYS",
  billableDayMethod: "STARTED_24_HOUR_PERIODS",
  minimumRentalMinutes: 1,
  minimumChargeDays: 1,
  gracePeriodMinutes: 0,
  taxTreatment: "TAX_EXCLUDED",
  taxRateBps: 1_900,
  insuranceSubtotal: money(0, "EUR"),
  source: { vehicleId: "car-1", rateSourceType: "CAR_PRICE", rateSourceReference: "car-1" },
  compatibilityMode: "LEGACY_CAR_PRICE",
  calculatedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
})

describe("pricing engine", () => {
  it("returns a deterministic complete result and trace", () => {
    const result = calculatePricing(request())
    expect(result).toMatchObject({
      currency: "EUR",
      units: { daily: 3, weekly: 1, monthly: 0 },
      baseSubtotal: 74_000,
      taxSubtotal: 14_060,
      grandTotal: 88_060,
      insuranceSubtotal: 0,
      selectedStrategy: "ORDERED_PERIODS",
    })
    expect(result.trace.steps.map(({ code }) => code)).toEqual([
      "CHARGEABLE_DURATION",
      "WEEKLY_UNITS",
      "DAILY_UNITS",
      "TAX",
      "GRAND_TOTAL",
    ])
  })

  it("rejects mixed currencies and nonzero insurance extension input", () => {
    expect(() =>
      calculatePricing(request({ rates: { ...request().rates, weekly: money(50_000, "USD") } })),
    ).toThrow(/same currency/)
    expect(() => calculatePricing(request({ insuranceSubtotal: money(1, "EUR") }))).toThrow(/not active/)
  })

  it("rejects calendar-month arithmetic when monthly rates are active", () => {
    expect(() => calculatePricing(request({ monthDefinition: "CALENDAR_MONTH" }))).toThrow(/deferred/)
  })
})
