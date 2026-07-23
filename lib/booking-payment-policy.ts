import type { BookingPaymentMethod, DepositType, RemainingBalanceRule } from "@prisma/client"

export function calculateConfiguredDeposit(total: number, depositType: DepositType, depositValue: number) {
  if (depositType === "NONE") return 0
  const amount = depositType === "FIXED_AMOUNT"
    ? depositValue
    : Math.round((total * depositValue) / 10_000)
  return Math.min(Math.max(amount, 0), total)
}

export function resolveBookingPaymentPolicy(input: {
  total: number
  paymentMethod: BookingPaymentMethod
  depositType: DepositType
  depositValue: number
}) {
  const depositAmount = calculateConfiguredDeposit(input.total, input.depositType, input.depositValue)
  const advancePaymentAmount = depositAmount > 0
    ? depositAmount
    : input.paymentMethod === "TRANSFER"
      ? input.total
      : 0
  const remainingBalanceRule: RemainingBalanceRule =
    advancePaymentAmount < input.total ? "ON_PICKUP" : "NOT_APPLICABLE"
  return {
    depositAmount,
    advancePaymentAmount,
    remainingBalanceRule,
    requiresAdvance: advancePaymentAmount > 0,
    confirmsAfterDocumentApproval: advancePaymentAmount === 0,
  }
}
