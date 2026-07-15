import { describe, expect, it } from "vitest"
import { evaluateDriverEligibility } from "@/lib/booking-configuration/driver-eligibility"
import { validBusinessConfigurationDomains } from "../../helpers/configuration-fixtures"
import type { BookingCustomerDriverInput } from "@/lib/booking-configuration/types"

const rules = () => ({
  ...validBusinessConfigurationDomains()["customer-driver-requirements"],
  minimumDriverAge: 21,
  maximumDriverAge: 75,
  minimumLicenceHeldMonths: 12,
  fields: {
    ...validBusinessConfigurationDomains()["customer-driver-requirements"].fields,
    LICENCE_NUMBER: "REQUIRED" as const,
    LICENCE_ISSUING_COUNTRY: "REQUIRED" as const,
  },
})
const customer = (overrides: BookingCustomerDriverInput = {}) => ({
  dateOfBirth: "2000-06-01",
  licenceNumber: "D12345678",
  licenceIssueDate: "2020-06-01",
  licenceExpiryDate: "2035-06-01",
  licenceIssuingCountry: "DE",
  ...overrides,
})
const evaluate = (
  overrides: Parameters<typeof evaluateDriverEligibility>[0]["customer"] = {},
  pickupAt = new Date("2030-06-01T10:00:00Z"),
  returnAt = new Date("2030-06-10T10:00:00Z"),
) =>
  evaluateDriverEligibility({
    rules: rules(),
    customer: customer(overrides),
    pickupAt,
    returnAt,
    businessTimeZone: "Europe/Berlin",
    evaluatedAt: new Date("2029-01-01T00:00:00Z"),
  })

describe("driver eligibility", () => {
  it("accepts exact minimum age and is calendar-aware", () => {
    const result = evaluate({ dateOfBirth: "2009-06-01" })
    expect(result.eligible).toBe(true)
    expect(result.ageAtPickup).toBe(21)
  })

  it("rejects one day below minimum age", () => {
    expect(evaluate({ dateOfBirth: "2009-06-02" }).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "DRIVER_UNDER_MINIMUM_AGE" })]),
    )
  })

  it("rejects maximum age, future birth dates, and impossible relationships", () => {
    expect(evaluate({ dateOfBirth: "1954-05-31" }).issues.map(({ code }) => code)).toContain("DRIVER_OVER_MAXIMUM_AGE")
    expect(evaluate({ dateOfBirth: "2031-01-01" }).issues.map(({ code }) => code)).toContain("INVALID_DRIVER_DATE")
    expect(evaluate({ licenceIssueDate: "1999-01-01" }).issues.map(({ code }) => code)).toContain("INVALID_DRIVER_DATE")
  })

  it("rejects missing and expired licence evidence with stable codes", () => {
    expect(
      evaluate({
        licenceNumber: undefined,
        licenceIssueDate: undefined,
        licenceExpiryDate: undefined,
        licenceIssuingCountry: undefined,
      }).issues.map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining([
        "LICENCE_NUMBER_REQUIRED",
        "LICENCE_ISSUE_DATE_REQUIRED",
        "LICENCE_EXPIRY_DATE_REQUIRED",
        "LICENCE_ISSUING_COUNTRY_REQUIRED",
      ]),
    )
    expect(evaluate({ licenceExpiryDate: "2030-05-31" }).issues.map(({ code }) => code)).toContain(
      "LICENCE_EXPIRED_AT_PICKUP",
    )
    expect(evaluate({ licenceExpiryDate: "2030-06-05" }).issues.map(({ code }) => code)).toContain(
      "LICENCE_EXPIRES_DURING_RENTAL",
    )
  })

  it("uses exact calendar months for the licence-holding boundary", () => {
    expect(evaluate({ licenceIssueDate: "2029-06-01" }).eligible).toBe(true)
    expect(evaluate({ licenceIssueDate: "2029-06-02" }).issues.map(({ code }) => code)).toContain(
      "LICENCE_HELD_TOO_SHORT",
    )
  })

  it("handles leap-day birthdays and DST independently", () => {
    const leapRules = rules()
    leapRules.minimumDriverAge = 18
    const input = {
      rules: leapRules,
      customer: customer({ dateOfBirth: "2012-02-29" }),
      pickupAt: new Date("2030-03-31T00:30:00Z"),
      returnAt: new Date("2030-04-02T00:30:00Z"),
      evaluatedAt: new Date("2029-01-01T00:00:00Z"),
    }
    expect(evaluateDriverEligibility({ ...input, businessTimeZone: "Europe/Berlin" }).ageAtPickup).toBe(18)
    expect(evaluateDriverEligibility({ ...input, businessTimeZone: "UTC" }).ageAtPickup).toBe(18)
  })
})
