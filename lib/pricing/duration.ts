import { PricingError } from "./errors"
import { assertSafeInteger } from "./money"
import type { BillableDayMethod, ChargeableDuration } from "./types"

const DAY_MILLISECONDS = 86_400_000
const MINUTE_MILLISECONDS = 60_000

interface DurationInput {
  pickupAt: Date
  returnAt: Date
  businessTimeZone: string
  billableDayMethod: BillableDayMethod
  minimumRentalMinutes: number
  minimumChargeDays: number
  gracePeriodMinutes: number
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0))
    return true
  } catch {
    return false
  }
}

function requireValidDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new PricingError("INVALID_DATE_RANGE", `${label} must be a valid timestamp.`, "VALIDATION")
  }
  return value
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  }
}

function localDayOrdinal(parts: ZonedParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MILLISECONDS)
}

function startedPeriods(elapsedMs: number, gracePeriodMinutes: number): number {
  const effective = Math.max(1, elapsedMs - gracePeriodMinutes * MINUTE_MILLISECONDS)
  return Math.ceil(effective / DAY_MILLISECONDS)
}

function calendarDays(pickup: ZonedParts, returned: ZonedParts, gracePeriodMinutes: number): number {
  const dayDifference = localDayOrdinal(returned) - localDayOrdinal(pickup)
  const pickupSecond = pickup.hour * 3600 + pickup.minute * 60 + pickup.second
  const returnSecond = returned.hour * 3600 + returned.minute * 60 + returned.second
  const graceSeconds = gracePeriodMinutes * 60

  // A timestamp rental must retain its final partial day. Comparing only the
  // local dates would undercharge whenever the return time is later than the
  // pickup time plus the configured grace period. Date-only requests still
  // preserve exclusive return-date semantics because both times are equal.
  return Math.max(1, dayDifference + (returnSecond > pickupSecond + graceSeconds ? 1 : 0))
}

function pickupBoundaries(pickup: ZonedParts, returned: ZonedParts, gracePeriodMinutes: number): number {
  const dayDifference = localDayOrdinal(returned) - localDayOrdinal(pickup)
  const pickupSecond = pickup.hour * 3600 + pickup.minute * 60 + pickup.second
  const returnSecond = returned.hour * 3600 + returned.minute * 60 + returned.second
  const graceSeconds = gracePeriodMinutes * 60
  return Math.max(1, dayDifference + (returnSecond > pickupSecond + graceSeconds ? 1 : 0))
}

export function calculateChargeableDuration(input: DurationInput): ChargeableDuration {
  const pickupAt = requireValidDate(input.pickupAt, "Pickup")
  const returnAt = requireValidDate(input.returnAt, "Return")
  if (returnAt.getTime() <= pickupAt.getTime()) {
    throw new PricingError("INVALID_DATE_RANGE", "Return must be after pickup.", "VALIDATION")
  }
  if (!isValidTimeZone(input.businessTimeZone)) {
    throw new PricingError("INVALID_TIMEZONE", "Business timezone must be a valid IANA timezone.", "VALIDATION")
  }

  const minimumRentalMinutes = assertSafeInteger(input.minimumRentalMinutes, "minimum rental minutes")
  const minimumChargeDays = assertSafeInteger(input.minimumChargeDays, "minimum charge days")
  const gracePeriodMinutes = assertSafeInteger(input.gracePeriodMinutes, "grace period minutes")
  if (minimumRentalMinutes < 1 || minimumChargeDays < 1) {
    throw new PricingError("INVALID_DATE_RANGE", "Minimum rental and charge must be positive.", "VALIDATION")
  }

  const elapsedMs = returnAt.getTime() - pickupAt.getTime()
  const elapsedMinutes = Math.ceil(elapsedMs / MINUTE_MILLISECONDS)
  if (elapsedMinutes < minimumRentalMinutes) {
    throw new PricingError("INVALID_DATE_RANGE", "Rental is shorter than the configured minimum.", "BUSINESS_RULE")
  }

  const pickupLocal = zonedParts(pickupAt, input.businessTimeZone)
  const returnLocal = zonedParts(returnAt, input.businessTimeZone)
  let calculatedDays: number
  switch (input.billableDayMethod) {
    case "STARTED_24_HOUR_PERIODS":
      calculatedDays = startedPeriods(elapsedMs, gracePeriodMinutes)
      break
    case "CALENDAR_DAYS":
      calculatedDays = calendarDays(pickupLocal, returnLocal, gracePeriodMinutes)
      break
    case "PICKUP_TIME_BOUNDARY":
      calculatedDays = pickupBoundaries(pickupLocal, returnLocal, gracePeriodMinutes)
      break
    default:
      throw new PricingError("INVALID_DATE_RANGE", "Unsupported duration strategy.", "VALIDATION")
  }

  const chargeableDays = Math.max(minimumChargeDays, calculatedDays)
  assertSafeInteger(chargeableDays, "chargeable days")
  return {
    pickupAt: pickupAt.toISOString(),
    returnAt: returnAt.toISOString(),
    elapsedMinutes,
    chargeableDurationMinutes: elapsedMinutes,
    chargeableDays,
    billableDayMethod: input.billableDayMethod,
    businessTimeZone: input.businessTimeZone,
    minimumChargeDays,
    gracePeriodMinutes,
  }
}

export function calculateDateOnlyDuration(input: {
  pickupDate: string
  returnDate: string
  businessTimeZone: string
  minimumChargeDays?: number
}): ChargeableDuration {
  const pattern = /^\d{4}-\d{2}-\d{2}$/
  if (!pattern.test(input.pickupDate) || !pattern.test(input.returnDate)) {
    throw new PricingError("INVALID_DATE_RANGE", "Date-only values must use YYYY-MM-DD.", "VALIDATION")
  }
  const pickupAt = new Date(`${input.pickupDate}T00:00:00.000Z`)
  const returnAt = new Date(`${input.returnDate}T00:00:00.000Z`)
  return calculateChargeableDuration({
    pickupAt,
    returnAt,
    businessTimeZone: input.businessTimeZone,
    billableDayMethod: "CALENDAR_DAYS",
    minimumRentalMinutes: 1,
    minimumChargeDays: input.minimumChargeDays ?? 1,
    gracePeriodMinutes: 0,
  })
}
