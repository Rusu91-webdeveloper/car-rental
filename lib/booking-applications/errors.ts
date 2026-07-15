export type BookingApplicationErrorCode =
  | "APPLICATION_NOT_FOUND"
  | "APPLICATION_ACCESS_DENIED"
  | "APPLICATION_EXPIRED"
  | "APPLICATION_TERMINAL"
  | "APPLICATION_REVISION_CONFLICT"
  | "APPLICATION_LOCATION_MISMATCH"
  | "APPLICATION_CONFIGURATION_UNAVAILABLE"
  | "APPLICATION_CUSTOMER_INVALID"
  | "APPLICATION_INSURANCE_INVALID"
  | "APPLICATION_PAYMENT_INVALID"
  | "APPLICATION_QUOTE_INVALID"
  | "APPLICATION_LEGAL_ACCEPTANCE_REQUIRED"
  | "APPLICATION_DOCUMENTS_INCOMPLETE"
  | "APPLICATION_NOT_READY"
  | "APPLICATION_VEHICLE_UNAVAILABLE"
  | "APPLICATION_PRICE_CHANGED"
  | "APPLICATION_LEGAL_CHANGED"
  | "APPLICATION_FINALIZATION_CONFLICT"

export class BookingApplicationError extends Error {
  constructor(
    readonly code: BookingApplicationErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "BookingApplicationError"
  }
}

export function applicationError(code: BookingApplicationErrorCode, message: string): never {
  throw new BookingApplicationError(code, message)
}
