import { describe, expect, it } from "vitest"
import { buildPricingAdminPageData } from "@/lib/pricing-admin/service"
import { validatePricingWorkspace } from "@/lib/pricing-admin/validation"
import { pricingWorkspaceRecords } from "../../helpers/pricing-admin-fixtures"

const codes = (records = pricingWorkspaceRecords()) => {
  const page = buildPricingAdminPageData(records)
  return validatePricingWorkspace(page).issues.map(({ code }) => code)
}

describe("pricing workspace validation", () => {
  it("accepts a complete daily-only fleet", () => {
    expect(validatePricingWorkspace(buildPricingAdminPageData(pricingWorkspaceRecords())).outcome).toBe("VALID")
  })

  it("requires weekly and monthly prices only when globally enabled", () => {
    const weekly = pricingWorkspaceRecords()
    weekly.pricingDraft!.configuration.weeklyPricingEnabled = true
    expect(codes(weekly)).toContain("rates.weekly_missing")
    const monthlyDisabled = pricingWorkspaceRecords()
    expect(codes(monthlyDisabled)).not.toContain("rates.monthly_missing")
  })

  it("accepts enabled period prices and warns when they provide no saving", () => {
    const records = pricingWorkspaceRecords()
    records.pricingDraft!.configuration.weeklyPricingEnabled = true
    records.pricingDraft!.configuration.monthlyPricingEnabled = true
    Object.assign(records.fleetDraft!.rates[0], { weeklyRateEnabled: true, weeklyRate: 56_000, monthlyRateEnabled: true, monthlyRate: 240_000 })
    expect(codes(records)).toEqual(expect.arrayContaining(["rates.no_weekly_saving", "rates.no_monthly_saving"]))
  })

  it("blocks unsupported calendar months and strategies without period rates", () => {
    const records = pricingWorkspaceRecords()
    records.pricingDraft!.configuration.rentalMonthDefinition = "CALENDAR_MONTH"
    records.pricingDraft!.configuration.mixedDurationStrategy = "LOWEST_VALID_TOTAL"
    expect(codes(records)).toEqual(expect.arrayContaining(["pricing.calendar_month_unsupported", "pricing.strategy_period_rate_disabled"]))
  })

  it("detects a newly active vehicle missing from an older draft", () => {
    const records = pricingWorkspaceRecords()
    records.vehicles.push({ id: "car-2", slug: "new-car", name: "New Car", status: "AVAILABLE", price: 9_000 })
    expect(codes(records)).toContain("rates.active_vehicle_missing")
  })

  it("warns for inactive vehicles retained in a draft", () => {
    const records = pricingWorkspaceRecords()
    records.vehicles[0].status = "MAINTENANCE"
    expect(codes(records)).toContain("rates.inactive_vehicle_present")
  })

  it("blocks mixed release and rate-set currencies", () => {
    const records = pricingWorkspaceRecords()
    records.fleetDraft!.currency = "USD"
    expect(codes(records)).toContain("rates.currency_mismatch")
  })
})
