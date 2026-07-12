import type { CustomerDriverRequirementsConfiguration } from "@/lib/business-configuration/domains"
import type { BookingCustomerDriverInput, DriverEligibilityIssue, DriverEligibilityResult } from "./types"

interface CalendarDate {
  year: number
  month: number
  day: number
}

function parseDate(value: string | undefined): CalendarDate | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day))
  if (check.getUTCFullYear() !== date.year || check.getUTCMonth() + 1 !== date.month || check.getUTCDate() !== date.day)
    return undefined
  return date
}

function zonedDate(value: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value)
  return { year: part("year"), month: part("month"), day: part("day") }
}

function compare(a: CalendarDate, b: CalendarDate) {
  return a.year !== b.year ? a.year - b.year : a.month !== b.month ? a.month - b.month : a.day - b.day
}

function fullYears(from: CalendarDate, to: CalendarDate) {
  let years = to.year - from.year
  if (to.month < from.month || (to.month === from.month && to.day < from.day)) years -= 1
  return years
}

function fullMonths(from: CalendarDate, to: CalendarDate) {
  let months = (to.year - from.year) * 12 + to.month - from.month
  if (to.day < from.day) months -= 1
  return months
}

export function evaluateDriverEligibility(input: {
  rules?: CustomerDriverRequirementsConfiguration
  customer: BookingCustomerDriverInput
  pickupAt: Date
  returnAt: Date
  businessTimeZone: string
  evaluatedAt?: Date
}): DriverEligibilityResult {
  const issues: DriverEligibilityIssue[] = []
  const evaluatedAt = (input.evaluatedAt ?? new Date()).toISOString()
  if (!input.rules)
    return {
      eligible: false,
      issues: [
        {
          code: "DRIVER_RULES_NOT_CONFIGURED",
          severity: "BLOCKER",
          message: "Driver requirements are unavailable.",
        },
      ],
      evaluatedAt,
    }
  const pickup = zonedDate(input.pickupAt, input.businessTimeZone)
  const returned = zonedDate(input.returnAt, input.businessTimeZone)
  const birth = parseDate(input.customer.dateOfBirth)
  const issue = parseDate(input.customer.licenceIssueDate)
  const expiry = parseDate(input.customer.licenceExpiryDate)
  const invalid = (field: DriverEligibilityIssue["field"], message: string) =>
    issues.push({
      code: "INVALID_DRIVER_DATE",
      severity: "BLOCKER",
      field,
      message,
    })

  if (!input.customer.dateOfBirth)
    issues.push({
      code: "DRIVER_DATE_OF_BIRTH_REQUIRED",
      severity: "BLOCKER",
      field: "DATE_OF_BIRTH",
      message: "Enter the driver's date of birth.",
    })
  else if (!birth) invalid("DATE_OF_BIRTH", "Enter a valid date of birth.")
  else if (compare(birth, pickup) >= 0) invalid("DATE_OF_BIRTH", "Date of birth must be before pickup.")

  const ageAtPickup = birth && compare(birth, pickup) < 0 ? fullYears(birth, pickup) : undefined
  if (ageAtPickup !== undefined && ageAtPickup < input.rules.minimumDriverAge)
    issues.push({
      code: "DRIVER_UNDER_MINIMUM_AGE",
      severity: "BLOCKER",
      field: "DATE_OF_BIRTH",
      message: `The driver must be at least ${input.rules.minimumDriverAge} at pickup.`,
    })
  if (
    ageAtPickup !== undefined &&
    input.rules.maximumDriverAge !== undefined &&
    ageAtPickup > input.rules.maximumDriverAge
  )
    issues.push({
      code: "DRIVER_OVER_MAXIMUM_AGE",
      severity: "BLOCKER",
      field: "DATE_OF_BIRTH",
      message: `The driver must be no older than ${input.rules.maximumDriverAge} at pickup.`,
    })

  const requiresLicenceNumber = input.rules.fields.LICENCE_NUMBER === "REQUIRED"
  const requiresIssueDate =
    input.rules.fields.LICENCE_ISSUE_DATE === "REQUIRED" || input.rules.minimumLicenceHeldMonths > 0
  const requiresExpiryDate =
    input.rules.fields.LICENCE_EXPIRY_DATE === "REQUIRED" || input.rules.licenceMustCoverRentalEnd
  const requiresIssuingCountry =
    input.rules.fields.LICENCE_ISSUING_COUNTRY === "REQUIRED" || input.rules.allowedLicenceCountries.length > 0

  if (requiresLicenceNumber && !input.customer.licenceNumber?.trim())
    issues.push({
      code: "LICENCE_NUMBER_REQUIRED",
      severity: "BLOCKER",
      field: "LICENCE_NUMBER",
      message: "Enter the driving licence number.",
    })
  if (requiresIssueDate && !input.customer.licenceIssueDate)
    issues.push({
      code: "LICENCE_ISSUE_DATE_REQUIRED",
      severity: "BLOCKER",
      field: "LICENCE_ISSUE_DATE",
      message: "Enter the licence issue date.",
    })
  else if (input.customer.licenceIssueDate && !issue) invalid("LICENCE_ISSUE_DATE", "Enter a valid licence issue date.")
  else if (issue && (compare(issue, pickup) > 0 || (birth && compare(issue, birth) <= 0)))
    invalid("LICENCE_ISSUE_DATE", "Licence issue date is not possible.")
  if (requiresExpiryDate && !input.customer.licenceExpiryDate)
    issues.push({
      code: "LICENCE_EXPIRY_DATE_REQUIRED",
      severity: "BLOCKER",
      field: "LICENCE_EXPIRY_DATE",
      message: "Enter the licence expiry date.",
    })
  else if (input.customer.licenceExpiryDate && !expiry)
    invalid("LICENCE_EXPIRY_DATE", "Enter a valid licence expiry date.")
  else if (expiry && compare(expiry, pickup) < 0)
    issues.push({
      code: "LICENCE_EXPIRED_AT_PICKUP",
      severity: "BLOCKER",
      field: "LICENCE_EXPIRY_DATE",
      message: "The licence is expired at pickup.",
    })
  else if (input.rules.licenceMustCoverRentalEnd && expiry && compare(expiry, returned) < 0)
    issues.push({
      code: "LICENCE_EXPIRES_DURING_RENTAL",
      severity: "BLOCKER",
      field: "LICENCE_EXPIRY_DATE",
      message: "The licence expires before the rental ends.",
    })
  if (issue && compare(issue, pickup) <= 0 && fullMonths(issue, pickup) < input.rules.minimumLicenceHeldMonths)
    issues.push({
      code: "LICENCE_HELD_TOO_SHORT",
      severity: "BLOCKER",
      field: "LICENCE_ISSUE_DATE",
      message: `The licence must have been held for at least ${input.rules.minimumLicenceHeldMonths} months.`,
    })
  if (requiresIssuingCountry && !input.customer.licenceIssuingCountry?.trim())
    issues.push({
      code: "LICENCE_ISSUING_COUNTRY_REQUIRED",
      severity: "BLOCKER",
      field: "LICENCE_ISSUING_COUNTRY",
      message: "Select the licence issuing country.",
    })
  else if (
    input.rules.allowedLicenceCountries.length > 0 &&
    input.customer.licenceIssuingCountry &&
    !input.rules.allowedLicenceCountries.includes(input.customer.licenceIssuingCountry.toUpperCase())
  )
    issues.push({
      code: "INVALID_DRIVER_DATE",
      severity: "BLOCKER",
      field: "LICENCE_ISSUING_COUNTRY",
      message: "This licence issuing country is not supported.",
    })

  return {
    eligible: !issues.some(({ severity }) => severity === "BLOCKER"),
    issues,
    ageAtPickup,
    licenceHeldMonthsAtPickup: issue ? fullMonths(issue, pickup) : undefined,
    evaluatedAt,
  }
}
