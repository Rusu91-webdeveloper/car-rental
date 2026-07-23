import { describe, expect, it } from "vitest"
import { resolveBookingPaymentPolicy, resolveOwnerDepositPolicy } from "@/lib/booking-payment-policy"

describe("production booking payment policy", () => {
  it("treats a zero-percent owner setting as no booking deposit", () => {
    expect(resolveOwnerDepositPolicy({ depositEnabled: true, depositPercentage: 0 })).toEqual({
      depositEnabled: false,
      depositValue: 0,
    })
    expect(resolveOwnerDepositPolicy({ depositEnabled: true, depositPercentage: 20 })).toEqual({
      depositEnabled: true,
      depositValue: 2_000,
    })
  })

  it.each([
    ["TRANSFER", "PERCENTAGE_BPS", 2_000, 20_000, 4_000, true, "ON_PICKUP"],
    ["TRANSFER", "NONE", 0, 20_000, 20_000, true, "NOT_APPLICABLE"],
    ["PAY_AT_PICKUP", "PERCENTAGE_BPS", 2_000, 20_000, 4_000, true, "ON_PICKUP"],
    ["PAY_AT_PICKUP", "NONE", 0, 20_000, 0, false, "ON_PICKUP"],
    ["PAY_AT_PICKUP", "PERCENTAGE_BPS", 10_000, 20_000, 20_000, true, "NOT_APPLICABLE"],
  ] as const)(
    "%s with %s resolves the correct advance and confirmation timing",
    (paymentMethod, depositType, depositValue, total, advance, requiresAdvance, remainingBalanceRule) => {
      expect(resolveBookingPaymentPolicy({ total, paymentMethod, depositType, depositValue })).toMatchObject({
        advancePaymentAmount: advance,
        requiresAdvance,
        confirmsAfterDocumentApproval: !requiresAdvance,
        remainingBalanceRule,
      })
    },
  )
})
