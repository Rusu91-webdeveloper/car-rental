import type {
  BusinessDayHours,
  BusinessHoursException,
  BusinessTimeWindow,
  BusinessWeekday,
  HandoverPolicy,
  WeeklyOpeningHours,
} from "@/lib/business-configuration/domains"

export type HandoverKind = "PICKUP" | "RETURN"

export interface HandoverEvent {
  at: Date | string
  kind: HandoverKind
}

export const BUSINESS_WEEKDAYS: readonly BusinessWeekday[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]

export const BUSINESS_WEEKDAY_LABELS: Record<BusinessWeekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
}

const DEFAULT_WINDOW: BusinessTimeWindow = { opensAt: "00:00", closesAt: "23:59" }
const DEFAULT_DAY: BusinessDayHours = {
  isOpen: true,
  pickupWindows: [{ ...DEFAULT_WINDOW }],
  returnWindows: [{ ...DEFAULT_WINDOW }],
}

// Backwards-compatible defaults preserve all-day handovers until the owner
// explicitly publishes the company's operational schedule.
export const DEFAULT_WEEKLY_OPENING_HOURS: WeeklyOpeningHours = Object.fromEntries(
  BUSINESS_WEEKDAYS.map((day) => [day, structuredClone(DEFAULT_DAY)]),
) as WeeklyOpeningHours

export const DEFAULT_OPENING_HOURS_EXCEPTIONS: BusinessHoursException[] = []

export const DEFAULT_HANDOVER_POLICY: HandoverPolicy = {
  slotIntervalMinutes: 30,
  minimumLeadTimeMinutes: 0,
  maximumPickupsPerSlot: 100,
  maximumReturnsPerSlot: 100,
  maximumTotalHandoversPerSlot: 100,
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function timeOfDayMinutes(value: string): number {
  if (!TIME_PATTERN.test(value)) return Number.NaN
  const [hour, minute] = value.split(":").map(Number)
  return hour * 60 + minute
}

function normalizeWindow(value: unknown): BusinessTimeWindow | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<BusinessTimeWindow>
  if (typeof candidate.opensAt !== "string" || typeof candidate.closesAt !== "string") return null
  if (!TIME_PATTERN.test(candidate.opensAt) || !TIME_PATTERN.test(candidate.closesAt)) return null
  if (timeOfDayMinutes(candidate.opensAt) >= timeOfDayMinutes(candidate.closesAt)) return null
  return { opensAt: candidate.opensAt, closesAt: candidate.closesAt }
}

function normalizeWindows(value: unknown, fallback: BusinessTimeWindow[] = []): BusinessTimeWindow[] {
  if (!Array.isArray(value)) return fallback.map((window) => ({ ...window }))
  const windows = value.flatMap((item) => {
    const normalized = normalizeWindow(item)
    return normalized ? [normalized] : []
  })
  return windows
}

function normalizeDay(value: unknown, fallback = DEFAULT_DAY): BusinessDayHours {
  const candidate = value && typeof value === "object"
    ? value as Partial<BusinessDayHours> & Partial<BusinessTimeWindow>
    : {}
  const legacyWindow = normalizeWindow(candidate)
  const fallbackPickup = fallback.pickupWindows
  const fallbackReturn = fallback.returnWindows
  return {
    isOpen: typeof candidate.isOpen === "boolean" ? candidate.isOpen : fallback.isOpen,
    pickupWindows: normalizeWindows(
      candidate.pickupWindows,
      legacyWindow ? [legacyWindow] : fallbackPickup,
    ),
    returnWindows: normalizeWindows(
      candidate.returnWindows,
      legacyWindow ? [legacyWindow] : fallbackReturn,
    ),
  }
}

export function normalizeWeeklyOpeningHours(value: unknown): WeeklyOpeningHours {
  const candidate = value && typeof value === "object"
    ? value as Partial<Record<BusinessWeekday, unknown>>
    : {}
  return Object.fromEntries(
    BUSINESS_WEEKDAYS.map((day) => [day, normalizeDay(candidate[day])]),
  ) as WeeklyOpeningHours
}

export function normalizeOpeningHoursExceptions(value: unknown): BusinessHoursException[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return []
    const candidate = item as Partial<BusinessHoursException>
    if (typeof candidate.date !== "string" || !DATE_PATTERN.test(candidate.date)) return []
    const normalized = normalizeDay(candidate, {
      isOpen: false,
      pickupWindows: [{ ...DEFAULT_WINDOW }],
      returnWindows: [{ ...DEFAULT_WINDOW }],
    })
    return [{
      id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : `legacy-exception-${index}-${candidate.date}`,
      date: candidate.date,
      label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : undefined,
      ...normalized,
    }]
  })
}

export function normalizeHandoverPolicy(value: unknown): HandoverPolicy {
  const candidate = value && typeof value === "object" ? value as Partial<HandoverPolicy> : {}
  const slotIntervalMinutes = [15, 30, 60].includes(Number(candidate.slotIntervalMinutes))
    ? Number(candidate.slotIntervalMinutes) as HandoverPolicy["slotIntervalMinutes"]
    : DEFAULT_HANDOVER_POLICY.slotIntervalMinutes
  const boundedInteger = (input: unknown, fallback: number, minimum: number, maximum: number) => {
    const number = Number(input)
    return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback
  }
  return {
    slotIntervalMinutes,
    minimumLeadTimeMinutes: boundedInteger(candidate.minimumLeadTimeMinutes, 0, 0, 43_200),
    maximumPickupsPerSlot: boundedInteger(candidate.maximumPickupsPerSlot, 100, 1, 100),
    maximumReturnsPerSlot: boundedInteger(candidate.maximumReturnsPerSlot, 100, 1, 100),
    maximumTotalHandoversPerSlot: boundedInteger(candidate.maximumTotalHandoversPerSlot, 100, 1, 200),
  }
}

function windowsEqual(left: BusinessTimeWindow[], right: BusinessTimeWindow[]) {
  return left.length === right.length && left.every((window, index) =>
    window.opensAt === right[index]?.opensAt && window.closesAt === right[index]?.closesAt)
}

export function weeklyOpeningHoursEqual(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeWeeklyOpeningHours(left)
  const normalizedRight = normalizeWeeklyOpeningHours(right)
  return BUSINESS_WEEKDAYS.every((day) => {
    const leftDay = normalizedLeft[day]
    const rightDay = normalizedRight[day]
    return leftDay.isOpen === rightDay.isOpen &&
      windowsEqual(leftDay.pickupWindows, rightDay.pickupWindows) &&
      windowsEqual(leftDay.returnWindows, rightDay.returnWindows)
  })
}

export function openingHoursExceptionsEqual(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeOpeningHoursExceptions(left)
  const normalizedRight = normalizeOpeningHoursExceptions(right)
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight)
}

export function handoverPoliciesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeHandoverPolicy(left)) === JSON.stringify(normalizeHandoverPolicy(right))
}

export function weekdayForDate(date: Date): BusinessWeekday {
  const jsDays: BusinessWeekday[] = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ]
  return jsDays[date.getDay()]
}

function localDateKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function openingHoursForDate(
  date: Date,
  weeklyOpeningHours: WeeklyOpeningHours,
  exceptions: BusinessHoursException[] = [],
): BusinessDayHours {
  const exception = exceptions.find((item) => item.date === localDateKey(date))
  return exception ?? weeklyOpeningHours[weekdayForDate(date)]
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const text = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""
  return {
    year: Number(text("year")),
    month: Number(text("month")),
    day: Number(text("day")),
    weekday: text("weekday").toUpperCase() as BusinessWeekday,
    hour: Number(text("hour")),
    minute: Number(text("minute")),
    second: Number(text("second")),
  }
}

export function businessLocalDateTimeToInstant(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match
  const expected = {
    year: Number(yearValue),
    month: Number(monthValue),
    day: Number(dayValue),
    hour: Number(hourValue),
    minute: Number(minuteValue),
  }
  const targetAsUtc = Date.UTC(expected.year, expected.month - 1, expected.day, expected.hour, expected.minute)
  let timestamp = targetAsUtc
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const actual = zonedParts(new Date(timestamp), timeZone)
      const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute)
      const correction = targetAsUtc - actualAsUtc
      timestamp += correction
      if (correction === 0) break
    }
    const resolved = new Date(timestamp)
    const actual = zonedParts(resolved, timeZone)
    return actual.year === expected.year && actual.month === expected.month && actual.day === expected.day &&
      actual.hour === expected.hour && actual.minute === expected.minute ? resolved : null
  } catch {
    return null
  }
}

export function instantToBusinessDateTimeLocal(instant: Date, timeZone: string): string | null {
  try {
    const parts = zonedParts(instant, timeZone)
    return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
  } catch {
    return null
  }
}

export function handoverTimeOptions(
  hours: BusinessDayHours,
  kind: HandoverKind,
  stepMinutes: HandoverPolicy["slotIntervalMinutes"] = 30,
): string[] {
  if (!hours?.isOpen) return []
  const windows = kind === "PICKUP" ? hours.pickupWindows : hours.returnWindows
  const values = new Set<string>()
  for (const window of windows) {
    const opening = timeOfDayMinutes(window.opensAt)
    const closing = timeOfDayMinutes(window.closesAt)
    if (!Number.isFinite(opening) || !Number.isFinite(closing) || opening >= closing) continue
    for (let minute = opening; minute <= closing; minute += stepMinutes) {
      values.add(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`)
    }
    values.add(window.closesAt)
  }
  return [...values].sort()
}

export function isHandoverTimeAllowed(
  instant: Date,
  businessTimeZone: string,
  weeklyOpeningHours: WeeklyOpeningHours,
  exceptions: BusinessHoursException[],
  policy: HandoverPolicy,
  kind: HandoverKind,
): boolean {
  if (Number.isNaN(instant.getTime())) return false
  try {
    const local = zonedParts(instant, businessTimeZone)
    if (local.second !== 0) return false
    const dateKey = `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`
    const exception = exceptions.find((item) => item.date === dateKey)
    const hours = exception ?? weeklyOpeningHours[local.weekday]
    const time = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`
    return handoverTimeOptions(hours, kind, policy.slotIntervalMinutes).includes(time)
  } catch {
    return false
  }
}

export function hasMinimumPickupLeadTime(pickupAt: Date, policy: HandoverPolicy, now = new Date()): boolean {
  return pickupAt.getTime() - now.getTime() >= policy.minimumLeadTimeMinutes * 60_000
}

export function handoverSlotHasCapacity(
  at: Date,
  kind: HandoverKind,
  events: HandoverEvent[],
  policy: HandoverPolicy,
): boolean {
  const slotEnd = at.getTime() + policy.slotIntervalMinutes * 60_000
  const inSlot = events.filter((event) => {
    const timestamp = new Date(event.at).getTime()
    return timestamp >= at.getTime() && timestamp < slotEnd
  })
  const sameKind = inSlot.filter((event) => event.kind === kind).length
  const kindLimit = kind === "PICKUP" ? policy.maximumPickupsPerSlot : policy.maximumReturnsPerSlot
  return sameKind < kindLimit && inSlot.length < policy.maximumTotalHandoversPerSlot
}

export function formatWeeklyOpeningHoursSummary(hours: WeeklyOpeningHours): string {
  return BUSINESS_WEEKDAYS.map((day) => {
    const value = hours[day]
    if (!value.isOpen) return `${BUSINESS_WEEKDAY_LABELS[day]}: Closed`
    const pickup = value.pickupWindows.map((window) => `${window.opensAt}–${window.closesAt}`).join(", ") || "none"
    const returns = value.returnWindows.map((window) => `${window.opensAt}–${window.closesAt}`).join(", ") || "none"
    return `${BUSINESS_WEEKDAY_LABELS[day]}: pickup ${pickup}; return ${returns}`
  }).join("; ")
}
