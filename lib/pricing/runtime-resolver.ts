import { PricingError } from "./errors"
import { fractionToBasisPoints, money, normalizeCurrency } from "./money"
import type { ActiveReleasePricingRecord, PricingContextRepository } from "./repositories"
import type { PricingRequest, PricingStrategy } from "./types"

export interface PricingContextRequest {
  vehicleId: string
  pickupAt: Date
  returnAt: Date
  paymentMethod: "TRANSFER" | "PAY_AT_PICKUP"
  calculatedAt?: Date
}

export interface ResolvedPricingContext {
  pricingRequest: PricingRequest
  depositRateBps: number
  guaranteeRateBps: number
}

function runtimeStrategy(strategy: ActiveReleasePricingRecord["strategy"]): PricingStrategy {
  switch (strategy) {
    case "DAILY_ONLY":
      return "DAILY_ONLY"
    case "LONGEST_BLOCKS_THEN_DAYS":
      return "ORDERED_PERIODS"
    case "LOWEST_VALID_TOTAL":
      return "LOWEST_VALID_PRICE"
    default:
      throw new PricingError("UNSUPPORTED_PRICING_STRATEGY", "Active pricing strategy is unsupported.")
  }
}

function validValidationStatus(value: string): boolean {
  return value === "VALID" || value === "WARNING"
}

function resolveActive(record: ActiveReleasePricingRecord, request: PricingContextRequest): ResolvedPricingContext {
  const lifecycleIsValid =
    record.releaseStatus === "ACTIVE" &&
    validValidationStatus(record.releaseValidationStatus) &&
    record.pricingVersionStatus === "RELEASED" &&
    validValidationStatus(record.pricingValidationStatus) &&
    record.fleetRateSetStatus === "RELEASED" &&
    validValidationStatus(record.fleetRateSetValidationStatus)
  if (!lifecycleIsValid) {
    throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "The active release has invalid pricing lifecycle state.", "OPERATIONAL")
  }
  if (!record.vehicleRentalRateId || record.dailyRate === undefined) {
    throw new PricingError("VEHICLE_NOT_IN_RATE_SET", "Vehicle is absent from the active fleet-rate set.")
  }
  const currency = normalizeCurrency(record.currency)
  if (normalizeCurrency(record.fleetCurrency) !== currency) {
    throw new PricingError("MIXED_CURRENCY", "Active release and fleet-rate currencies differ.", "OPERATIONAL")
  }
  if (record.monthDefinition === "CALENDAR_MONTH" && record.monthlyRateEnabled) {
    throw new PricingError("UNSUPPORTED_MONTH_DEFINITION", "Calendar-month pricing is not active in Phase 3.")
  }

  return {
    pricingRequest: {
      vehicleId: request.vehicleId,
      pickupAt: request.pickupAt,
      returnAt: request.returnAt,
      businessTimeZone: record.businessTimeZone,
      rates: {
        daily: money(record.dailyRate, currency),
        weekly: record.weeklyRate == null ? undefined : money(record.weeklyRate, currency),
        monthly: record.monthlyRate == null ? undefined : money(record.monthlyRate, currency),
        weeklyEnabled: Boolean(record.weeklyRateEnabled),
        monthlyEnabled: Boolean(record.monthlyRateEnabled),
      },
      strategy: runtimeStrategy(record.strategy),
      persistentStrategy: record.strategy,
      monthDefinition: record.monthDefinition,
      billableDayMethod: record.billableDayMethod,
      minimumRentalMinutes: record.minimumRentalMinutes,
      minimumChargeDays: record.minimumChargeDays,
      gracePeriodMinutes: record.gracePeriodMinutes,
      taxTreatment: record.taxTreatment,
      taxRateBps: record.taxRateBps,
      insuranceSubtotal: money(0, currency),
      source: {
        vehicleId: request.vehicleId,
        rateSourceType: "FLEET_RATE_SET",
        rateSourceReference: record.vehicleRentalRateId,
        configurationReleaseId: record.releaseId,
        releaseNumber: record.releaseNumber,
        pricingConfigVersionId: record.pricingConfigVersionId,
        pricingVersionNumber: record.pricingVersionNumber,
        fleetRateSetId: record.fleetRateSetId,
        fleetRateSetVersionNumber: record.fleetRateSetVersionNumber,
        vehicleRentalRateId: record.vehicleRentalRateId,
      },
      compatibilityMode: "ACTIVE_RELEASE",
      configurationVersion: String(record.releaseNumber),
      calculatedAt: request.calculatedAt,
    },
    depositRateBps: fractionToBasisPoints(record.depositFraction, "deposit percentage"),
    guaranteeRateBps: fractionToBasisPoints(record.guaranteeFraction, "guarantee percentage"),
  }
}

export async function resolvePricingContext(
  repository: PricingContextRepository,
  request: PricingContextRequest,
): Promise<ResolvedPricingContext> {
  const active = await repository.findActivePricingConfiguration(request.vehicleId)
  if (active) return resolveActive(active, request)

  const legacy = await repository.findLegacyVehicleRate(request.vehicleId)
  if (!legacy) throw new PricingError("RATE_NOT_FOUND", "Vehicle or legacy daily price was not found.")
  const currency = normalizeCurrency(legacy.currency)
  const configuredTaxRateBps = fractionToBasisPoints(legacy.taxRateFraction, "tax rate")
  const usesTaxFallback = !legacy.taxIncluded && configuredTaxRateBps === 0
  const taxRateBps = usesTaxFallback ? 1_000 : configuredTaxRateBps

  return {
    pricingRequest: {
      vehicleId: request.vehicleId,
      pickupAt: request.pickupAt,
      returnAt: request.returnAt,
      businessTimeZone: "UTC",
      rates: {
        daily: money(legacy.dailyRate, currency),
        weeklyEnabled: false,
        monthlyEnabled: false,
      },
      strategy: "DAILY_ONLY",
      persistentStrategy: "DAILY_ONLY",
      monthDefinition: "FIXED_30_DAYS",
      billableDayMethod: "STARTED_24_HOUR_PERIODS",
      minimumRentalMinutes: 1,
      minimumChargeDays: 1,
      gracePeriodMinutes: 0,
      taxTreatment: legacy.taxIncluded ? "TAX_INCLUDED" : "TAX_EXCLUDED",
      taxRateBps,
      insuranceSubtotal: money(0, currency),
      source: {
        vehicleId: request.vehicleId,
        rateSourceType: "CAR_PRICE",
        rateSourceReference: request.vehicleId,
      },
      compatibilityMode: "LEGACY_CAR_PRICE",
      configurationVersion: "legacy",
      calculatedAt: request.calculatedAt,
      warnings: usesTaxFallback
        ? ["Compatibility mode preserves the existing unconfigured 10% tax fallback."]
        : [],
    },
    depositRateBps:
      request.paymentMethod === "TRANSFER"
        ? fractionToBasisPoints(legacy.depositFraction, "deposit percentage")
        : 0,
    guaranteeRateBps: fractionToBasisPoints(legacy.guaranteeFraction, "guarantee percentage"),
  }
}
