import { calculateChargeableDuration } from "./duration"
import { PricingError } from "./errors"
import {
  assertSafeInteger,
  checkedAdd,
  multiplyByBasisPoints,
  requireSameCurrency,
} from "./money"
import { applyPricingStrategy } from "./strategies"
import { PRICING_ENGINE_VERSION, type PricingRequest, type PricingResult } from "./types"

function monthDays(definition: PricingRequest["monthDefinition"]): number | undefined {
  switch (definition) {
    case "FIXED_28_DAYS":
      return 28
    case "FIXED_30_DAYS":
      return 30
    case "CALENDAR_MONTH":
      return undefined
  }
}

export function calculatePricing(request: PricingRequest): PricingResult {
  if (request.monthDefinition === "CALENDAR_MONTH" && request.rates.monthlyEnabled) {
    throw new PricingError("UNSUPPORTED_MONTH_DEFINITION", "Calendar-month pricing is deferred.")
  }

  const monetaryInputs = [
    request.rates.daily,
    ...(request.rates.weekly ? [request.rates.weekly] : []),
    ...(request.rates.monthly ? [request.rates.monthly] : []),
    ...(request.adjustments?.map((adjustment) => adjustment.amount) ?? []),
    ...(request.insuranceSubtotal ? [request.insuranceSubtotal] : []),
  ]
  const currency = requireSameCurrency(monetaryInputs)
  const duration = calculateChargeableDuration(request)
  const strategy = applyPricingStrategy(request.strategy, duration.chargeableDays, {
    dailyRate: request.rates.daily.amount,
    weeklyRate: request.rates.weekly?.amount,
    monthlyRate: request.rates.monthly?.amount,
    weeklyEnabled: request.rates.weeklyEnabled,
    monthlyEnabled: request.rates.monthlyEnabled,
    monthDays: monthDays(request.monthDefinition),
  })

  const adjustments = (request.adjustments ?? []).map((adjustment) => ({
    code: adjustment.code,
    label: adjustment.label,
    amount: assertSafeInteger(adjustment.amount.amount, "adjustment", true),
  }))
  const adjustmentTotal = checkedAdd(adjustments.map(({ amount }) => amount), "adjustment total")
  const insuranceSubtotal = request.insuranceSubtotal?.amount ?? 0
  if (insuranceSubtotal !== 0) {
    throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "Insurance pricing is not active in Phase 3.")
  }
  const taxableSubtotal = checkedAdd([strategy.subtotal, adjustmentTotal, insuranceSubtotal], "taxable subtotal")
  if (taxableSubtotal < 0) throw new PricingError("INVALID_RATE", "Adjustments cannot make a quote negative.")
  const taxRateBps = assertSafeInteger(request.taxRateBps, "tax basis points")
  if (taxRateBps > 10_000) throw new PricingError("INVALID_RATE", "Tax basis points must not exceed 10,000.")
  const taxSubtotal = request.taxTreatment === "TAX_INCLUDED" ? 0 : multiplyByBasisPoints(taxableSubtotal, taxRateBps)
  const grandTotal = checkedAdd([taxableSubtotal, taxSubtotal], "grand total")
  const engineVersion = request.engineVersion ?? PRICING_ENGINE_VERSION
  const calculatedAt = (request.calculatedAt ?? new Date()).toISOString()

  return {
    currency,
    pickupAt: duration.pickupAt,
    returnAt: duration.returnAt,
    chargeableDuration: duration,
    durationStrategy: request.billableDayMethod,
    units: strategy.units,
    sourceDailyRate: request.rates.daily.amount,
    sourceWeeklyRate: request.rates.weekly?.amount ?? null,
    sourceMonthlyRate: request.rates.monthly?.amount ?? null,
    selectedStrategy: request.strategy,
    persistentStrategy: request.persistentStrategy,
    monthDefinition: request.monthDefinition,
    baseSubtotal: strategy.subtotal,
    adjustments,
    adjustmentTotal,
    insuranceSubtotal,
    taxTreatment: request.taxTreatment,
    taxRateBps,
    taxSubtotal,
    grandTotal,
    pricingEngineVersion: engineVersion,
    source: request.source,
    calculatedAt,
    trace: {
      engineVersion,
      duration,
      steps: [
        {
          code: "CHARGEABLE_DURATION",
          message: `Chargeable duration: ${duration.chargeableDays} day(s).`,
          units: duration.chargeableDays,
        },
        ...strategy.steps,
        ...(taxSubtotal > 0
          ? [{ code: "TAX", message: `Applied ${taxRateBps} basis points of compatibility/configured tax.`, subtotal: taxSubtotal }]
          : []),
        { code: "GRAND_TOTAL", message: `Grand total: ${grandTotal} minor units.`, subtotal: grandTotal },
      ],
    },
    warnings: [...(request.warnings ?? [])],
    compatibilityMode: request.compatibilityMode,
  }
}
