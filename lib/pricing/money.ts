import { PricingError } from "./errors"

export type CurrencyCode = string

export interface Money {
  amount: number
  currency: CurrencyCode
}

const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/

export function normalizeCurrency(value: string): CurrencyCode {
  const normalized = value.trim().toUpperCase()
  if (!ISO_CURRENCY_PATTERN.test(normalized)) {
    throw new PricingError("MIXED_CURRENCY", "Currency must be a three-letter ISO 4217 code.", "VALIDATION")
  }
  return normalized
}

export function assertSafeInteger(value: number, label: string, allowNegative = false): number {
  if (!Number.isSafeInteger(value) || (!allowNegative && value < 0)) {
    throw new PricingError(
      Number.isFinite(value) ? "INVALID_RATE" : "NUMERIC_OVERFLOW",
      `${label} must be ${allowNegative ? "a" : "a non-negative"} safe integer.`,
      "VALIDATION",
    )
  }
  return value
}

function fromBigInt(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new PricingError("NUMERIC_OVERFLOW", `${label} exceeds JavaScript safe-integer limits.`, "VALIDATION")
  }
  return Number(value)
}

export function checkedAdd(values: readonly number[], label = "amount"): number {
  return fromBigInt(values.reduce((sum, value) => sum + BigInt(assertSafeInteger(value, label, true)), BigInt(0)), label)
}

export function checkedMultiply(amount: number, units: number, label = "amount"): number {
  assertSafeInteger(amount, label)
  assertSafeInteger(units, "units")
  return fromBigInt(BigInt(amount) * BigInt(units), label)
}

export function roundHalfUp(numerator: number | bigint, denominator: number | bigint): number {
  const n = typeof numerator === "bigint" ? numerator : BigInt(assertSafeInteger(numerator, "numerator", true))
  const d = typeof denominator === "bigint" ? denominator : BigInt(assertSafeInteger(denominator, "denominator"))
  if (d <= BigInt(0)) throw new PricingError("INVALID_RATE", "Rounding denominator must be positive.", "VALIDATION")
  const sign = n < BigInt(0) ? BigInt(-1) : BigInt(1)
  const absolute = n < BigInt(0) ? -n : n
  return fromBigInt(sign * ((absolute + d / BigInt(2)) / d), "rounded amount")
}

export function multiplyByBasisPoints(amount: number, basisPoints: number): number {
  assertSafeInteger(amount, "amount", true)
  assertSafeInteger(basisPoints, "basis points")
  if (basisPoints > 10_000) throw new PricingError("INVALID_RATE", "Basis points must not exceed 10,000.", "VALIDATION")
  return roundHalfUp(BigInt(amount) * BigInt(basisPoints), BigInt(10_000))
}

export function fractionToBasisPoints(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new PricingError("INVALID_RATE", `${label} must be between zero and one.`, "VALIDATION")
  }
  const scaled = value * 10_000
  const rounded = Math.round(scaled)
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-9) {
    throw new PricingError("INVALID_RATE", `${label} cannot be represented exactly in basis points.`, "VALIDATION")
  }
  return rounded
}

export function majorToMinorUnits(value: string): number {
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) throw new PricingError("INVALID_RATE", "Major-unit amount must have at most two decimal places.", "VALIDATION")
  const sign = match[1] === "-" ? BigInt(-1) : BigInt(1)
  const whole = BigInt(match[2])
  const fraction = BigInt((match[3] ?? "").padEnd(2, "0"))
  return fromBigInt(sign * (whole * BigInt(100) + fraction), "minor-unit amount")
}

export function minorToMajorUnits(value: number): string {
  assertSafeInteger(value, "minor-unit amount", true)
  const sign = value < 0 ? "-" : ""
  const absolute = Math.abs(value)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`
}

export function money(amount: number, currency: string): Money {
  return { amount: assertSafeInteger(amount, "money amount", true), currency: normalizeCurrency(currency) }
}

export function requireSameCurrency(values: readonly Money[]): CurrencyCode {
  if (values.length === 0) throw new PricingError("RATE_NOT_FOUND", "At least one monetary value is required.")
  const currency = normalizeCurrency(values[0].currency)
  if (values.some((value) => normalizeCurrency(value.currency) !== currency)) {
    throw new PricingError("MIXED_CURRENCY", "All rates in a quote must use the same currency.", "VALIDATION")
  }
  return currency
}
