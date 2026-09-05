import { parseDateOnlyLocal } from "@/lib/business-date"

const TIME_ONLY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function checkoutDateTimeLocal(
  dateValue: string,
  timeValue: string | null,
  fallbackHour = 10,
): string {
  const date = parseDateOnlyLocal(dateValue)
  if (!date) return ""

  const timeMatch = timeValue ? TIME_ONLY_PATTERN.exec(timeValue) : null
  const hour = timeMatch ? Number(timeMatch[1]) : fallbackHour
  const minute = timeMatch ? Number(timeMatch[2]) : 0
  date.setHours(hour, minute, 0, 0)

  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function checkoutTimeParam(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
}
