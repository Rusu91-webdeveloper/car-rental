import { describe, expect, it } from "vitest"
import {
  effectiveMinimumRentalMinutes,
  isRentalDurationTooShort,
  minimumRentalDays,
  minimumRentalPeriodMessage,
  minimumReturnAt,
} from "@/lib/booking-configuration/minimum-rental"

describe("minimum rental customer rules", () => {
  it("uncouples legacy charge-floor values without removing genuine duration rules", () => {
    expect(effectiveMinimumRentalMinutes(2_880, 2)).toBe(1)
    expect(effectiveMinimumRentalMinutes(1_440, 1)).toBe(1)
    expect(effectiveMinimumRentalMinutes(60, 2)).toBe(60)
  })

  it("converts the configured minute threshold to customer-facing days", () => {
    expect(minimumRentalDays(1_440)).toBe(1)
    expect(minimumRentalDays(2_880)).toBe(2)
    expect(minimumRentalDays(4_320)).toBe(3)
  })

  it("calculates and enforces the earliest allowed return", () => {
    const pickup = new Date("2026-07-26T10:00:00.000Z")
    expect(minimumReturnAt(pickup, 2_880).toISOString()).toBe("2026-07-28T10:00:00.000Z")
    expect(isRentalDurationTooShort(pickup, new Date("2026-07-28T09:59:00.000Z"), 2_880)).toBe(true)
    expect(isRentalDurationTooShort(pickup, new Date("2026-07-28T10:00:00.000Z"), 2_880)).toBe(false)
  })

  it("explains the configured threshold in English and German", () => {
    expect(minimumRentalPeriodMessage("en", 2_880)).toContain("2 days")
    expect(minimumRentalPeriodMessage("de", 4_320)).toContain("3 Tage")
  })
})
