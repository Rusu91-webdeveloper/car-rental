import { PricingError } from "./errors"
import { assertSafeInteger, checkedAdd, checkedMultiply } from "./money"
import type { PricingStrategy, PricingTraceStep, PricingUnits } from "./types"

// Hard bound prevents configuration mistakes from creating an unbounded optimizer workload.
// 10,000 days is over 27 years and comfortably exceeds a realistic rental duration.
export const MAX_OPTIMIZATION_DAYS = 10_000

export interface StrategyRateSet {
  dailyRate: number
  weeklyRate?: number
  monthlyRate?: number
  weeklyEnabled: boolean
  monthlyEnabled: boolean
  monthDays?: number
}

export interface StrategyResult {
  units: PricingUnits
  subtotal: number
  steps: PricingTraceStep[]
}

interface Candidate extends PricingUnits {
  subtotal: number
}

function validateRates(rates: StrategyRateSet): void {
  if (!Number.isSafeInteger(rates.dailyRate) || rates.dailyRate <= 0) {
    throw new PricingError("INVALID_RATE", "Daily rate must be a positive safe integer.", "VALIDATION")
  }
  for (const [enabled, value, label] of [
    [rates.weeklyEnabled, rates.weeklyRate, "Weekly"],
    [rates.monthlyEnabled, rates.monthlyRate, "Monthly"],
  ] as const) {
    if (enabled && (!Number.isSafeInteger(value) || (value ?? 0) <= 0)) {
      throw new PricingError("INVALID_RATE", `${label} rate must be positive when enabled.`, "VALIDATION")
    }
  }
  if (rates.monthlyEnabled && (!Number.isSafeInteger(rates.monthDays) || (rates.monthDays ?? 0) <= 0)) {
    throw new PricingError("UNSUPPORTED_MONTH_DEFINITION", "Fixed monthly pricing requires a positive day count.")
  }
}

function result(candidate: Candidate, rates: StrategyRateSet): StrategyResult {
  const steps: PricingTraceStep[] = []
  if (candidate.monthly > 0) {
    steps.push({
      code: "MONTHLY_UNITS",
      message: `Applied ${candidate.monthly} fixed-month unit(s).`,
      units: candidate.monthly,
      unitRate: rates.monthlyRate,
      subtotal: checkedMultiply(rates.monthlyRate!, candidate.monthly, "monthly subtotal"),
    })
  }
  if (candidate.weekly > 0) {
    steps.push({
      code: "WEEKLY_UNITS",
      message: `Applied ${candidate.weekly} weekly unit(s).`,
      units: candidate.weekly,
      unitRate: rates.weeklyRate,
      subtotal: checkedMultiply(rates.weeklyRate!, candidate.weekly, "weekly subtotal"),
    })
  }
  if (candidate.daily > 0) {
    steps.push({
      code: "DAILY_UNITS",
      message: `Applied ${candidate.daily} daily unit(s).`,
      units: candidate.daily,
      unitRate: rates.dailyRate,
      subtotal: checkedMultiply(rates.dailyRate, candidate.daily, "daily subtotal"),
    })
  }
  return {
    units: { daily: candidate.daily, weekly: candidate.weekly, monthly: candidate.monthly },
    subtotal: candidate.subtotal,
    steps,
  }
}

function priceCandidate(units: PricingUnits, rates: StrategyRateSet): Candidate {
  return {
    ...units,
    subtotal: checkedAdd(
      [
        checkedMultiply(rates.dailyRate, units.daily, "daily subtotal"),
        checkedMultiply(rates.weeklyRate ?? 0, units.weekly, "weekly subtotal"),
        checkedMultiply(rates.monthlyRate ?? 0, units.monthly, "monthly subtotal"),
      ],
      "strategy subtotal",
    ),
  }
}

export function dailyOnly(days: number, rates: StrategyRateSet): StrategyResult {
  assertSafeInteger(days, "chargeable days")
  validateRates(rates)
  return result(priceCandidate({ daily: days, weekly: 0, monthly: 0 }, rates), rates)
}

export function orderedPeriods(days: number, rates: StrategyRateSet): StrategyResult {
  assertSafeInteger(days, "chargeable days")
  validateRates(rates)
  let remaining = days
  const monthly = rates.monthlyEnabled ? Math.floor(remaining / rates.monthDays!) : 0
  remaining -= monthly * (rates.monthDays ?? 0)
  const weekly = rates.weeklyEnabled ? Math.floor(remaining / 7) : 0
  remaining -= weekly * 7
  return result(priceCandidate({ daily: remaining, weekly, monthly }, rates), rates)
}

function isPreferred(candidate: Candidate, incumbent: Candidate): boolean {
  if (candidate.subtotal !== incumbent.subtotal) return candidate.subtotal < incumbent.subtotal
  const candidateUnits = candidate.daily + candidate.weekly + candidate.monthly
  const incumbentUnits = incumbent.daily + incumbent.weekly + incumbent.monthly
  if (candidateUnits !== incumbentUnits) return candidateUnits < incumbentUnits
  if (candidate.monthly !== incumbent.monthly) return candidate.monthly > incumbent.monthly
  if (candidate.weekly !== incumbent.weekly) return candidate.weekly > incumbent.weekly
  return candidate.daily < incumbent.daily
}

export function lowestValidPrice(days: number, rates: StrategyRateSet): StrategyResult {
  assertSafeInteger(days, "chargeable days")
  validateRates(rates)
  if (days > MAX_OPTIMIZATION_DAYS) {
    throw new PricingError("NUMERIC_OVERFLOW", `Optimization is bounded to ${MAX_OPTIMIZATION_DAYS} chargeable days.`)
  }

  let best = priceCandidate({ daily: days, weekly: 0, monthly: 0 }, rates)
  const maximumMonthly = rates.monthlyEnabled ? Math.ceil(days / rates.monthDays!) : 0
  for (let monthly = 0; monthly <= maximumMonthly; monthly += 1) {
    const afterMonths = Math.max(0, days - monthly * (rates.monthDays ?? 0))
    const maximumWeekly = rates.weeklyEnabled ? Math.ceil(afterMonths / 7) : 0
    for (let weekly = 0; weekly <= maximumWeekly; weekly += 1) {
      const daily = Math.max(0, afterMonths - weekly * 7)
      const candidate = priceCandidate({ daily, weekly, monthly }, rates)
      if (isPreferred(candidate, best)) best = candidate
    }
  }
  return result(best, rates)
}

export function applyPricingStrategy(
  strategy: PricingStrategy,
  days: number,
  rates: StrategyRateSet,
): StrategyResult {
  switch (strategy) {
    case "DAILY_ONLY":
      return dailyOnly(days, rates)
    case "ORDERED_PERIODS":
      return orderedPeriods(days, rates)
    case "LOWEST_VALID_PRICE":
      return lowestValidPrice(days, rates)
    default:
      throw new PricingError("UNSUPPORTED_PRICING_STRATEGY", "The selected pricing strategy is not supported.")
  }
}
