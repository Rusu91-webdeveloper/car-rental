import { describe, expect, it } from "vitest"
import {
  hasBankTransferLeadTime,
  requiresAdvanceBankTransfer,
  resolveAdvancePaymentDueAt,
} from "@/lib/booking-payment-timing"

describe("booking payment timing", () => {
  const now = new Date("2026-07-31T09:26:00.000Z")

  it("rejects bank transfer when tomorrow's pickup is less than 48 hours away", () => {
    const pickupAt = new Date("2026-08-01T06:00:00.000Z")

    expect(hasBankTransferLeadTime(pickupAt, now)).toBe(false)
    expect(resolveAdvancePaymentDueAt({ pickupAt, now })).toBeNull()
  })

  it("allows exactly 48 hours and keeps a 24-hour processing buffer", () => {
    const pickupAt = new Date("2026-08-02T09:26:00.000Z")

    expect(hasBankTransferLeadTime(pickupAt, now)).toBe(true)
    expect(resolveAdvancePaymentDueAt({ pickupAt, now })).toEqual(
      new Date("2026-08-01T09:26:00.000Z"),
    )
  })

  it("identifies every method that still needs an advance bank transfer", () => {
    expect(requiresAdvanceBankTransfer({ paymentMethod: "TRANSFER", depositType: "NONE" })).toBe(true)
    expect(requiresAdvanceBankTransfer({ paymentMethod: "PAY_AT_PICKUP", depositType: "PERCENTAGE_BPS" })).toBe(true)
    expect(requiresAdvanceBankTransfer({ paymentMethod: "PAY_AT_PICKUP", depositType: "NONE" })).toBe(false)
  })
})
