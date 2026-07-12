import { describe, expect, it } from "vitest"
import { quoteLegacyPricing } from "@/lib/pricing/legacy-adapter"
import { bookingTotalFromSnapshot, toBookingPricingSnapshotData } from "@/lib/pricing/snapshot"

describe("booking pricing snapshots", () => {
  it("maps complete compatibility provenance and breakdown", async () => {
    const quote = await quoteLegacyPricing({
      vehicleId: "car-1",
      pickupAt: new Date("2026-01-01T00:00:00Z"),
      returnAt: new Date("2026-01-03T00:00:00Z"),
      carPriceMinorUnits: 10_000,
      currency: "EUR",
      taxIncluded: true,
      calculatedAt: new Date("2026-01-01T00:00:00Z"),
    })
    const snapshot = toBookingPricingSnapshotData("booking-1", quote)
    expect(snapshot).toMatchObject({
      bookingId: "booking-1",
      compatibilityMode: true,
      rateSourceType: "CAR_PRICE",
      rateSourceReference: "car-1",
      configurationReleaseId: null,
      sourceDailyRate: 10_000,
      dailyUnits: 2,
      grandTotal: 20_000,
      currency: "EUR",
    })
    expect(snapshot.calculationTrace).toMatchObject({ compatibilityMode: "LEGACY_CAR_PRICE" })
  })

  it("renders immutable snapshot totals when present and legacy scalars otherwise", () => {
    expect(bookingTotalFromSnapshot({ totalPrice: 100, pricingSnapshot: { grandTotal: 200 } })).toBe(200)
    expect(bookingTotalFromSnapshot({ totalPrice: 100, pricingSnapshot: null })).toBe(100)
    expect(bookingTotalFromSnapshot({ totalPrice: 100 })).toBe(100)
  })
})
