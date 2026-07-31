import { describe, expect, it } from "vitest"
import type { PublicBookingConfiguration } from "@/lib/booking-configuration/types"
import { DEFAULT_WEEKLY_OPENING_HOURS } from "@/lib/business-hours"
import { businessDayOverlapsRanges, parseDateOnlyLocal } from "@/lib/business-date"
import {
  dateOnlySearchHandoverWindows,
  hasAvailableSearchWindow,
} from "@/lib/date-only-search-availability"

const configuration: Pick<
  PublicBookingConfiguration,
  | "businessTimeZone"
  | "weeklyOpeningHours"
  | "openingHoursExceptions"
  | "handoverPolicy"
  | "minimumRentalMinutes"
> = {
  businessTimeZone: "Europe/Berlin",
  weeklyOpeningHours: DEFAULT_WEEKLY_OPENING_HOURS,
  openingHoursExceptions: [],
  handoverPolicy: {
    slotIntervalMinutes: 30,
    minimumLeadTimeMinutes: 60,
    maximumPickupsPerSlot: 1,
    maximumReturnsPerSlot: 1,
    maximumTotalHandoversPerSlot: 1,
  },
  minimumRentalMinutes: 2 * 24 * 60,
}

describe("date-only fleet availability", () => {
  it("rejects impossible calendar dates instead of allowing Date rollover", () => {
    expect(parseDateOnlyLocal("2026-02-30")).toBeNull()
    expect(parseDateOnlyLocal("2026-08-10")).toBeInstanceOf(Date)
  })

  it("does not mark the day after an unavailable range that ends at business midnight", () => {
    const day = parseDateOnlyLocal("2026-08-12")!
    expect(businessDayOverlapsRanges(day, "Europe/Berlin", [{
      start: new Date("2026-08-09T08:00:00.000Z"),
      end: new Date("2026-08-11T22:00:00.000Z"),
    }])).toBe(false)
  })

  it("builds real handover instants in the configured business timezone", () => {
    const windows = dateOnlySearchHandoverWindows({
      pickupDate: "2026-08-10",
      returnDate: "2026-08-12",
      configuration,
      handoverEvents: [],
      now: new Date("2026-08-01T00:00:00.000Z"),
    })

    expect(windows.length).toBeGreaterThan(0)
    expect(windows.some(({ pickupAt, returnAt }) =>
      pickupAt.toISOString() === "2026-08-09T22:00:00.000Z" &&
      returnAt.toISOString() === "2026-08-11T22:00:00.000Z",
    )).toBe(true)
  })

  it("removes full handover slots and ranges that overlap preparation time", () => {
    const windows = dateOnlySearchHandoverWindows({
      pickupDate: "2026-08-10",
      returnDate: "2026-08-12",
      configuration,
      handoverEvents: [{ at: new Date("2026-08-09T22:00:00.000Z"), kind: "PICKUP" }],
      now: new Date("2026-08-01T00:00:00.000Z"),
    })

    expect(windows.some(({ pickupAt }) => pickupAt.toISOString() === "2026-08-09T22:00:00.000Z")).toBe(false)
    expect(hasAvailableSearchWindow(windows, [{
      start: new Date("2026-08-09T21:00:00.000Z"),
      end: new Date("2026-08-13T00:00:00.000Z"),
    }])).toBe(false)
  })

  it("returns no windows when the selected dates violate minimum rental duration", () => {
    expect(dateOnlySearchHandoverWindows({
      pickupDate: "2026-08-10",
      returnDate: "2026-08-11",
      configuration,
      handoverEvents: [],
      now: new Date("2026-08-01T00:00:00.000Z"),
    })).toEqual([])
  })
})
