import { majorToMinorUnits, minorToMajorUnits } from "@/lib/pricing/money"
import { PricingError } from "@/lib/pricing/errors"

export function parseAdminMoneyInput(value: string, options?: { optional?: boolean }) {
  const normalized = value.trim()
  if (!normalized) {
    if (options?.optional) return undefined
    throw new PricingError("INVALID_RATE", "Enter an amount.", "VALIDATION")
  }
  if (normalized.includes(",")) {
    throw new PricingError(
      "INVALID_RATE",
      "Use a dot as the decimal separator, for example 10.50.",
      "VALIDATION",
    )
  }
  const amount = majorToMinorUnits(normalized)
  if (amount < 0) {
    throw new PricingError("INVALID_RATE", "Amounts cannot be negative.", "VALIDATION")
  }
  return amount
}

export function formatAdminMoneyInput(minorUnits: number | undefined) {
  return minorUnits === undefined ? "" : minorToMajorUnits(minorUnits)
}
