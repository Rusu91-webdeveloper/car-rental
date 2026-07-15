import { describe, expect, it } from "vitest"
import { buildPricingAdminPageData } from "@/lib/pricing-admin/service"
import { pricingWorkspaceRecords } from "../../helpers/pricing-admin-fixtures"

describe("pricing admin page projection", () => {
  it("projects complete coverage and exact legacy evidence", () => {
    const page = buildPricingAdminPageData(pricingWorkspaceRecords())
    expect(page.coverage).toMatchObject({ totalActiveVehicles: 1, dailyRates: 1, vehiclesNotInDraft: 0 })
    expect(page.vehicles[0]).toMatchObject({ legacyDailyRate: 7_500, draftDailyRate: 8_000, businessIdentifier: "fixture-car" })
  })

  it("does not invent percentages when no live rate exists", () => {
    const page = buildPricingAdminPageData(pricingWorkspaceRecords())
    expect(page.comparison.rateChanges[0].percentageChange).toBeUndefined()
    expect(page.comparison.addedVehicles).toEqual(["Fixture Car"])
  })

  it("reports changed fields and affected vehicle count", () => {
    const records = pricingWorkspaceRecords()
    records.activeRelease = null
    const page = buildPricingAdminPageData(records)
    expect(page.comparison.affectedVehicleCount).toBe(1)
    expect(page.vehicles[0].changedFromLive).toBe(true)
  })
})
