import { describe, expect, it } from "vitest"
import type { ActiveReleasePricingRecord, PricingContextRepository } from "@/lib/pricing/repositories"
import { quoteVehicleRental } from "@/lib/pricing/quote-service"

const request = {
  vehicleId: "car-1",
  pickupAt: new Date("2026-01-01T00:00:00Z"),
  returnAt: new Date("2026-01-11T00:00:00Z"),
  paymentMethod: "TRANSFER" as const,
  calculatedAt: new Date("2026-01-01T00:00:00Z"),
}

const active: ActiveReleasePricingRecord = {
  releaseId: "release-1",
  releaseNumber: 1,
  releaseStatus: "ACTIVE",
  releaseValidationStatus: "VALID",
  pricingConfigVersionId: "pricing-1",
  pricingVersionNumber: 1,
  pricingVersionStatus: "RELEASED",
  pricingValidationStatus: "VALID",
  fleetRateSetId: "rates-1",
  fleetRateSetVersionNumber: 1,
  fleetRateSetStatus: "RELEASED",
  fleetRateSetValidationStatus: "VALID",
  vehicleRentalRateId: "rate-1",
  vehicleId: "car-1",
  currency: "EUR",
  fleetCurrency: "EUR",
  businessTimeZone: "Europe/Berlin",
  dailyRate: 8_000,
  weeklyRate: 50_000,
  monthlyRate: 180_000,
  weeklyRateEnabled: true,
  monthlyRateEnabled: true,
  strategy: "LONGEST_BLOCKS_THEN_DAYS",
  monthDefinition: "FIXED_30_DAYS",
  billableDayMethod: "STARTED_24_HOUR_PERIODS",
  gracePeriodMinutes: 0,
  minimumRentalMinutes: 1,
  minimumChargeDays: 1,
  taxTreatment: "TAX_INCLUDED",
  taxRateBps: 0,
  depositFraction: 0.2,
  guaranteeFraction: 0,
}

const repository = (activeValue: ActiveReleasePricingRecord | null): PricingContextRepository => ({
  async findActivePricingConfiguration() {
    return activeValue
  },
  async findLegacyVehicleRate() {
    return {
      vehicleId: "car-1",
      dailyRate: 10_000,
      currency: "EUR",
      taxIncluded: true,
      taxRateFraction: 0,
      depositFraction: 0.2,
      guaranteeFraction: 0,
    }
  },
})

describe("runtime pricing source resolution", () => {
  it("uses legacy mode when no active release exists and ignores inactive rate sets", async () => {
    const quote = await quoteVehicleRental(repository(null), request)
    expect(quote.compatibilityMode).toBe("LEGACY_CAR_PRICE")
    expect(quote.sourceDailyRate).toBe(10_000)
    expect(quote.source.rateSourceType).toBe("CAR_PRICE")
  })

  it("uses the exact active release and fleet rate", async () => {
    const quote = await quoteVehicleRental(repository(active), request)
    expect(quote.compatibilityMode).toBe("ACTIVE_RELEASE")
    expect(quote.sourceDailyRate).toBe(8_000)
    expect(quote.units).toEqual({ daily: 3, weekly: 1, monthly: 0 })
    expect(quote.source.configurationReleaseId).toBe("release-1")
  })

  it("allows an earlier return for legacy charge-floor settings while charging the floor", async () => {
    const quote = await quoteVehicleRental(
      repository({ ...active, minimumRentalMinutes: 2_880, minimumChargeDays: 2 }),
      {
        ...request,
        pickupAt: new Date("2026-07-31T12:00:00.000Z"),
        returnAt: new Date("2026-08-02T06:00:00.000Z"),
      },
    )

    expect(quote.chargeableDuration.chargeableDays).toBe(2)
  })

  it("fails safely for an invalid active release without calling legacy", async () => {
    let legacyCalled = false
    const invalidRepository: PricingContextRepository = {
      async findActivePricingConfiguration() {
        return { ...active, releaseValidationStatus: "BLOCKED" }
      },
      async findLegacyVehicleRate() {
        legacyCalled = true
        return null
      },
    }
    await expect(quoteVehicleRental(invalidRepository, request)).rejects.toMatchObject({ code: "ACTIVE_CONFIGURATION_INVALID" })
    expect(legacyCalled).toBe(false)
  })

  it("fails when the vehicle is absent or currencies differ", async () => {
    await expect(quoteVehicleRental(repository({ ...active, vehicleRentalRateId: undefined, dailyRate: undefined }), request)).rejects.toMatchObject({ code: "VEHICLE_NOT_IN_RATE_SET" })
    await expect(quoteVehicleRental(repository({ ...active, fleetCurrency: "USD" }), request)).rejects.toMatchObject({ code: "MIXED_CURRENCY" })
  })

  it("rejects calendar-month pricing", async () => {
    await expect(quoteVehicleRental(repository({ ...active, monthDefinition: "CALENDAR_MONTH" }), request)).rejects.toMatchObject({ code: "UNSUPPORTED_MONTH_DEFINITION" })
  })
})
