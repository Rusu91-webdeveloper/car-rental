export const BOOKING_PAYMENT_WINDOW_HOURS = 24
export const BOOKING_PAYMENT_WINDOW_MS = BOOKING_PAYMENT_WINDOW_HOURS * 60 * 60 * 1000

// Manual bank transfers need time both for the customer to initiate payment and
// for the rental company to match the incoming transfer before handover.
export const BANK_TRANSFER_MINIMUM_LEAD_HOURS = 48
export const BANK_TRANSFER_MINIMUM_LEAD_MS = BANK_TRANSFER_MINIMUM_LEAD_HOURS * 60 * 60 * 1000
export const BANK_TRANSFER_PROCESSING_BUFFER_HOURS = 24
export const BANK_TRANSFER_PROCESSING_BUFFER_MS = BANK_TRANSFER_PROCESSING_BUFFER_HOURS * 60 * 60 * 1000
