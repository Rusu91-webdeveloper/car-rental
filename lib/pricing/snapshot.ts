import { PRICING_SNAPSHOT_SCHEMA_VERSION, type BookingPricingQuote } from "./types"

export function toBookingPricingSnapshotData(bookingId: string, quote: BookingPricingQuote) {
  const releaseBacked = quote.compatibilityMode === "ACTIVE_RELEASE"
  return {
    bookingId,
    configurationReleaseId: quote.source.configurationReleaseId ?? null,
    pricingConfigVersionId: quote.source.pricingConfigVersionId ?? null,
    fleetRateSetId: quote.source.fleetRateSetId ?? null,
    vehicleRentalRateId: quote.source.vehicleRentalRateId ?? null,
    snapshotSchemaVersion: PRICING_SNAPSHOT_SCHEMA_VERSION,
    releaseNumber: quote.source.releaseNumber ?? null,
    pricingVersionNumber: quote.source.pricingVersionNumber ?? null,
    fleetRateSetVersionNumber: quote.source.fleetRateSetVersionNumber ?? null,
    pricingEngineVersion: quote.pricingEngineVersion,
    compatibilityMode: !releaseBacked,
    rateSourceType: quote.source.rateSourceType,
    rateSourceReference: quote.source.rateSourceReference,
    mixedDurationStrategy: quote.persistentStrategy,
    currency: quote.currency,
    chargeableDurationMinutes: quote.chargeableDuration.chargeableDurationMinutes,
    chargeableDays: quote.chargeableDuration.chargeableDays,
    billableDayMethod: quote.durationStrategy,
    rentalMonthDefinition: quote.monthDefinition,
    dailyUnits: quote.units.daily,
    weeklyUnits: quote.units.weekly,
    monthlyUnits: quote.units.monthly,
    sourceDailyRate: quote.sourceDailyRate,
    sourceWeeklyRate: quote.sourceWeeklyRate,
    sourceMonthlyRate: quote.sourceMonthlyRate,
    baseSubtotal: quote.baseSubtotal,
    insuranceSubtotal: quote.insuranceSubtotal,
    adjustmentTotal: quote.adjustmentTotal,
    taxTotal: quote.taxSubtotal,
    grandTotal: quote.grandTotal,
    calculatedAt: new Date(quote.calculatedAt),
    calculationTrace: {
      compatibilityMode: quote.compatibilityMode,
      warnings: quote.warnings,
      adjustments: quote.adjustments,
      payment: quote.payment,
      trace: quote.trace,
    },
  }
}

export function bookingTotalFromSnapshot<T extends { totalPrice: number; pricingSnapshot?: { grandTotal: number } | null }>(
  booking: T,
): number {
  return booking.pricingSnapshot?.grandTotal ?? booking.totalPrice
}
