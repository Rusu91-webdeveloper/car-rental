import {
  BANK_TRANSFER_MINIMUM_LEAD_MS,
  BANK_TRANSFER_PROCESSING_BUFFER_MS,
  BOOKING_PAYMENT_WINDOW_MS,
} from "@/lib/constants"

type PaymentMethod = "TRANSFER" | "PAY_AT_PICKUP"
type DepositType = "NONE" | "FIXED_AMOUNT" | "PERCENTAGE_BPS"

export function requiresAdvanceBankTransfer(input: {
  paymentMethod: PaymentMethod
  depositType: DepositType
}): boolean {
  return input.paymentMethod === "TRANSFER" || input.depositType !== "NONE"
}

export function hasBankTransferLeadTime(pickupAt: Date, now = new Date()): boolean {
  const pickupTime = pickupAt.getTime()
  const nowTime = now.getTime()
  return Number.isFinite(pickupTime) && Number.isFinite(nowTime) && pickupTime - nowTime >= BANK_TRANSFER_MINIMUM_LEAD_MS
}

export function resolveAdvancePaymentDueAt(input: {
  pickupAt: Date
  now?: Date
}): Date | null {
  const now = input.now ?? new Date()
  if (!hasBankTransferLeadTime(input.pickupAt, now)) return null

  return new Date(Math.min(
    now.getTime() + BOOKING_PAYMENT_WINDOW_MS,
    input.pickupAt.getTime() - BANK_TRANSFER_PROCESSING_BUFFER_MS,
  ))
}
