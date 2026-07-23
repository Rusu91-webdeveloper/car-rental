export const PRICING_ERROR_CODES = [
  "INVALID_DATE_RANGE",
  "INVALID_TIMEZONE",
  "RATE_NOT_FOUND",
  "RATE_DISABLED",
  "INVALID_RATE",
  "MIXED_CURRENCY",
  "UNSUPPORTED_PRICING_STRATEGY",
  "UNSUPPORTED_MONTH_DEFINITION",
  "NUMERIC_OVERFLOW",
  "CONFIGURATION_NOT_ACTIVE",
  "ACTIVE_CONFIGURATION_INVALID",
  "VEHICLE_NOT_IN_RATE_SET",
  "SNAPSHOT_PERSISTENCE_FAILED",
  "LEGAL_ACKNOWLEDGEMENT_REQUIRED",
] as const

export type PricingErrorCode = (typeof PRICING_ERROR_CODES)[number]
export type PricingErrorKind = "VALIDATION" | "BUSINESS_RULE" | "OPERATIONAL" | "AUTHORIZATION"

export class PricingError extends Error {
  readonly code: PricingErrorCode
  readonly kind: PricingErrorKind

  constructor(code: PricingErrorCode, message: string, kind: PricingErrorKind = "BUSINESS_RULE") {
    super(message)
    this.name = "PricingError"
    this.code = code
    this.kind = kind
  }
}

export function isPricingError(error: unknown): error is PricingError {
  return error instanceof PricingError
}

export function publicPricingErrorMessage(error: PricingError): string {
  switch (error.code) {
    case "INVALID_DATE_RANGE":
      if (error.message === "Rental is shorter than the configured minimum.")
        return "This booking is shorter than the minimum rental period. Choose a later drop-off date."
      return "Please select a valid pickup and drop-off period."
    case "RATE_NOT_FOUND":
    case "RATE_DISABLED":
      return "Pricing is not available for this vehicle."
    case "VEHICLE_NOT_IN_RATE_SET":
      return "This vehicle's price has not been published yet. Please choose another vehicle or contact the rental company."
    case "INVALID_TIMEZONE":
    case "INVALID_RATE":
    case "MIXED_CURRENCY":
    case "UNSUPPORTED_PRICING_STRATEGY":
    case "UNSUPPORTED_MONTH_DEFINITION":
    case "NUMERIC_OVERFLOW":
    case "CONFIGURATION_NOT_ACTIVE":
    case "ACTIVE_CONFIGURATION_INVALID":
    case "SNAPSHOT_PERSISTENCE_FAILED":
      return "A valid price could not be calculated. Please try again or contact support."
    case "LEGAL_ACKNOWLEDGEMENT_REQUIRED":
      return "Please acknowledge the required legal terms before booking."
  }
}
