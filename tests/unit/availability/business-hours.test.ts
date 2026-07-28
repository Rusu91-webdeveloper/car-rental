import { describe, expect, it } from "vitest"
import {
  BUSINESS_WEEKDAYS,
  DEFAULT_HANDOVER_POLICY,
  DEFAULT_WEEKLY_OPENING_HOURS,
  businessLocalDateTimeToInstant,
  handoverSlotHasCapacity,
  handoverTimeOptions,
  hasMinimumPickupLeadTime,
  instantToBusinessDateTimeLocal,
  isHandoverTimeAllowed,
  normalizeWeeklyOpeningHours,
  openingHoursForDate,
  weeklyOpeningHoursEqual,
} from "@/lib/business-hours"
import type { WeeklyOpeningHours } from "@/lib/business-configuration/domains"

function closedWeek(): WeeklyOpeningHours {
  return Object.fromEntries(
    BUSINESS_WEEKDAYS.map((day) => [day, {
      isOpen: false,
      pickupWindows: [{ opensAt: "09:00", closesAt: "17:00" }],
      returnWindows: [{ opensAt: "08:00", closesAt: "18:00" }],
    }]),
  ) as unknown as WeeklyOpeningHours
}

describe("weekly business opening hours", () => {
  it("evaluates pickup and return instants in the business timezone", () => {
    const hours = closedWeek()
    hours.MONDAY.isOpen = true

    const allowed = (instant: string, kind: "PICKUP" | "RETURN") => isHandoverTimeAllowed(
      new Date(instant), "Europe/Bucharest", hours, [], DEFAULT_HANDOVER_POLICY, kind,
    )
    expect(allowed("2026-07-27T06:00:00.000Z", "PICKUP")).toBe(true)
    expect(allowed("2026-07-27T15:00:00.000Z", "PICKUP")).toBe(false)
    expect(allowed("2026-07-27T15:00:00.000Z", "RETURN")).toBe(true)
    expect(allowed("2026-07-27T15:00:01.000Z", "RETURN")).toBe(false)
    expect(allowed("2026-07-28T06:00:00.000Z", "PICKUP")).toBe(false)
  })

  it("converts displayed business-local choices without using the customer's timezone", () => {
    const instant = businessLocalDateTimeToInstant("2026-07-27T09:00", "Europe/Bucharest")
    expect(instant?.toISOString()).toBe("2026-07-27T06:00:00.000Z")
    expect(instantToBusinessDateTimeLocal(instant!, "Europe/Bucharest")).toBe("2026-07-27T09:00")
  })

  it("generates customer choices at thirty-minute intervals and keeps the closing time", () => {
    expect(handoverTimeOptions({
      isOpen: true,
      pickupWindows: [
        { opensAt: "09:15", closesAt: "10:30" },
        { opensAt: "13:00", closesAt: "14:00" },
      ],
      returnWindows: [],
    }, "PICKUP", 30)).toEqual([
      "09:15",
      "09:45",
      "10:15",
      "10:30",
      "13:00",
      "13:30",
      "14:00",
    ])
    expect(handoverTimeOptions({ isOpen: false, pickupWindows: [], returnWindows: [] }, "PICKUP")).toEqual([])
  })

  it("replaces weekly hours with a date-specific holiday exception", () => {
    const exception = {
      id: "holiday",
      date: "2026-07-27",
      label: "Holiday",
      isOpen: false,
      pickupWindows: [],
      returnWindows: [],
    }
    expect(openingHoursForDate(new Date(2026, 6, 27), DEFAULT_WEEKLY_OPENING_HOURS, [exception]).isOpen).toBe(false)
  })

  it("enforces minimum notice and shared pickup/return capacity", () => {
    const now = new Date("2026-07-27T06:00:00.000Z")
    const policy = {
      ...DEFAULT_HANDOVER_POLICY,
      minimumLeadTimeMinutes: 240,
      maximumPickupsPerSlot: 2,
      maximumReturnsPerSlot: 2,
      maximumTotalHandoversPerSlot: 3,
    }
    expect(hasMinimumPickupLeadTime(new Date("2026-07-27T10:00:00.000Z"), policy, now)).toBe(true)
    expect(hasMinimumPickupLeadTime(new Date("2026-07-27T09:59:00.000Z"), policy, now)).toBe(false)
    const events = [
      { at: "2026-07-27T10:00:00.000Z", kind: "PICKUP" as const },
      { at: "2026-07-27T10:05:00.000Z", kind: "PICKUP" as const },
      { at: "2026-07-27T10:10:00.000Z", kind: "RETURN" as const },
    ]
    expect(handoverSlotHasCapacity(new Date("2026-07-27T10:00:00.000Z"), "PICKUP", events, policy)).toBe(false)
    expect(handoverSlotHasCapacity(new Date("2026-07-27T10:00:00.000Z"), "RETURN", events, policy)).toBe(false)
  })

  it("normalizes legacy data to the backwards-compatible all-day schedule", () => {
    expect(normalizeWeeklyOpeningHours(undefined)).toEqual(DEFAULT_WEEKLY_OPENING_HOURS)
  })

  it("compares schedules independently of JSON property order", () => {
    const reversed = Object.fromEntries(
      [...BUSINESS_WEEKDAYS].reverse().map((day) => [day, DEFAULT_WEEKLY_OPENING_HOURS[day]]),
    )
    expect(weeklyOpeningHoursEqual(DEFAULT_WEEKLY_OPENING_HOURS, reversed)).toBe(true)
  })
})
