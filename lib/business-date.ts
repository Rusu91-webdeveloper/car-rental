import { businessLocalDateTimeToInstant, instantToBusinessDateTimeLocal } from "@/lib/business-hours"

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseDateOnlyLocal(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return null
  const [, yearValue, monthValue, dayValue] = match
  const year = Number(yearValue)
  const month = Number(monthValue)
  const day = Number(dayValue)
  const parsed = new Date(year, month - 1, day)
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
    ? parsed
    : null
}

export function dateKeyFromLocalDate(value: Date): string {
  return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

export function addDateOnlyDays(value: string, days: number): string | null {
  const parsed = parseDateOnlyLocal(value)
  if (!parsed) return null
  const utc = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()))
  utc.setUTCDate(utc.getUTCDate() + days)
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`
}

export function businessDayInterval(
  day: Date,
  businessTimeZone: string,
): { start: Date; end: Date } | null {
  const dateKey = dateKeyFromLocalDate(day)
  const nextDateKey = addDateOnlyDays(dateKey, 1)
  if (!nextDateKey) return null
  const start = businessLocalDateTimeToInstant(`${dateKey}T00:00`, businessTimeZone)
  const end = businessLocalDateTimeToInstant(`${nextDateKey}T00:00`, businessTimeZone)
  return start && end ? { start, end } : null
}

export function businessTodayLocalDate(businessTimeZone: string, now = new Date()): Date {
  const dateKey = instantToBusinessDateTimeLocal(now, businessTimeZone)?.slice(0, 10)
  const today = dateKey ? parseDateOnlyLocal(dateKey) ?? new Date(now) : new Date(now)
  today.setHours(0, 0, 0, 0)
  return today
}

export function businessDayOverlapsRanges(
  day: Date,
  businessTimeZone: string,
  ranges: Array<{ start: Date; end: Date }>,
): boolean {
  const interval = businessDayInterval(day, businessTimeZone)
  if (!interval) return false
  return ranges.some((range) => range.start < interval.end && range.end > interval.start)
}
