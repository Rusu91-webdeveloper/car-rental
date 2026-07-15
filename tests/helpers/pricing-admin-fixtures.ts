import type { PricingWorkspaceRecords } from "@/lib/pricing-admin/repositories"

export function pricingWorkspaceRecords(): PricingWorkspaceRecords {
  return {
    activeRelease: null,
    draftRelease: null,
    companyCurrency: "EUR",
    pricingDraft: {
      id: "pricing-draft",
      versionNumber: 1,
      status: "DRAFT",
      validationStatus: "NOT_VALIDATED",
      revision: 1,
      changeSummary: "Initial pricing",
      updatedAt: "2026-07-12T00:00:00.000Z",
      updatedBy: "Pricing Manager",
      configuration: {
        weeklyPricingEnabled: false,
        monthlyPricingEnabled: false,
        mixedDurationStrategy: "DAILY_ONLY",
        rentalMonthDefinition: "FIXED_30_DAYS",
        billableDayRule: "STARTED_24_HOUR_PERIODS",
        gracePeriodMinutes: 0,
        minimumRentalMinutes: 1,
        minimumChargeDays: 1,
        pricesIncludeTax: true,
        taxRateBps: 0,
      },
    },
    fleetDraft: {
      id: "fleet-draft",
      versionNumber: 1,
      status: "DRAFT",
      validationStatus: "NOT_VALIDATED",
      revision: 1,
      currency: "EUR",
      changeSummary: "Initial pricing",
      updatedAt: "2026-07-12T00:00:00.000Z",
      updatedBy: "Pricing Manager",
      rates: [{ id: "rate-1", vehicleId: "car-1", dailyRate: 8_000, weeklyRateEnabled: false, monthlyRateEnabled: false }],
    },
    vehicles: [
      { id: "car-1", slug: "fixture-car", name: "Fixture Car", status: "AVAILABLE", price: 7_500 },
    ],
  }
}
