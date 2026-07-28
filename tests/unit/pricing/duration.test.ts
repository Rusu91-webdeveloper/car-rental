import { describe, expect, it } from "vitest"
import { calculateChargeableDuration, calculateDateOnlyDuration } from "@/lib/pricing/duration"
import { PricingError, publicPricingErrorMessage } from "@/lib/pricing/errors"

const duration = (pickupAt: string, returnAt: string, overrides = {}) =>
  calculateChargeableDuration({
    pickupAt: new Date(pickupAt),
    returnAt: new Date(returnAt),
    businessTimeZone: "Europe/Berlin",
    billableDayMethod: "STARTED_24_HOUR_PERIODS",
    minimumRentalMinutes: 1,
    minimumChargeDays: 1,
    gracePeriodMinutes: 0,
    ...overrides,
  })

describe("chargeable duration", () => {
  it("preserves one-day, same-day, exact-24-hour, and partial-started-day behavior", () => {
    expect(duration("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z").chargeableDays).toBe(1)
    expect(duration("2026-01-01T10:00:00Z", "2026-01-02T10:00:00Z").chargeableDays).toBe(1)
    expect(duration("2026-01-01T10:00:00Z", "2026-01-02T10:00:00.001Z").chargeableDays).toBe(2)
  })

  it("honors minimum charge and grace boundaries", () => {
    expect(duration("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z", { minimumChargeDays: 3 }).chargeableDays).toBe(3)
    expect(duration("2026-01-01T10:00:00Z", "2026-01-02T10:30:00Z", { gracePeriodMinutes: 30 }).chargeableDays).toBe(1)
    expect(duration("2026-01-01T10:00:00Z", "2026-01-02T10:31:00Z", { gracePeriodMinutes: 30 }).chargeableDays).toBe(2)
  })

  it("charges the final partial calendar day after the configured grace period", () => {
    const calendarRule = {
      businessTimeZone: "Europe/Bucharest",
      billableDayMethod: "CALENDAR_DAYS" as const,
      gracePeriodMinutes: 120,
    }

    expect(duration("2026-07-29T07:00:00Z", "2026-07-31T09:00:00Z", calendarRule).chargeableDays).toBe(2)
    expect(duration("2026-07-29T07:00:00Z", "2026-07-31T09:01:00Z", calendarRule).chargeableDays).toBe(3)
    expect(duration("2026-07-29T07:00:00Z", "2026-07-31T11:00:00Z", calendarRule).chargeableDays).toBe(3)
  })

  it("rejects reversed, invalid, too-short, and invalid-timezone inputs", () => {
    expect(() => duration("2026-01-02T10:00:00Z", "2026-01-01T10:00:00Z")).toThrow(/after pickup/)
    expect(() => duration("invalid", "2026-01-01T10:00:00Z")).toThrow(/valid timestamp/)
    expect(() => duration("2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z", { minimumRentalMinutes: 60 })).toThrow(/shorter/)
    expect(() => duration("2026-01-01T10:00:00Z", "2026-01-02T10:00:00Z", { businessTimeZone: "Mars/Olympus" })).toThrow(/IANA/)
  })

  it("explains a minimum booking failure to the customer", () => {
    try {
      duration("2026-01-01T10:00:00Z", "2026-01-02T10:00:00Z", {
        minimumRentalMinutes: 2_880,
      })
      throw new Error("Expected the rental to be rejected")
    } catch (error) {
      expect(error).toBeInstanceOf(PricingError)
      expect(publicPricingErrorMessage(error as PricingError)).toBe(
        "This booking is shorter than the minimum rental period. Choose a later drop-off date.",
      )
    }
  })

  it("handles DST spring and autumn transitions explicitly", () => {
    expect(duration("2026-03-28T11:00:00Z", "2026-03-29T10:00:00Z").chargeableDays).toBe(1)
    expect(duration("2026-10-24T10:00:00Z", "2026-10-25T11:00:00Z").chargeableDays).toBe(2)
    expect(duration("2026-10-24T10:00:00Z", "2026-10-25T11:00:00Z", { billableDayMethod: "CALENDAR_DAYS" }).chargeableDays).toBe(1)
  })

  it("supports pickup-time boundaries and date-only compatibility", () => {
    expect(duration("2026-01-01T09:00:00Z", "2026-01-02T09:31:00Z", { billableDayMethod: "PICKUP_TIME_BOUNDARY", gracePeriodMinutes: 30 }).chargeableDays).toBe(2)
    expect(calculateDateOnlyDuration({ pickupDate: "2026-01-01", returnDate: "2026-01-11", businessTimeZone: "UTC" }).chargeableDays).toBe(10)
  })
})
