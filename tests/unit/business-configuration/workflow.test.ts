import { describe, expect, it } from "vitest"
import { buildReleasePreview, validateReleaseAggregate } from "@/lib/business-configuration/workflow-service"
import { validReleaseAggregate, withVersion } from "../../helpers/release-fixtures"

const vehicles = [{ id: "vehicle-1", name: "Fixture Car" }]

describe("configuration release workflow", () => {
  it("validates a complete release without activating it", () => {
    const release = validReleaseAggregate()
    const result = validateReleaseAggregate(release, null, vehicles)
    expect(result.outcome).toBe("VALID")
    expect(release.status).toBe("VALIDATED")
  })

  it("blocks a missing domain payload with a stable code", () => {
    const release = validReleaseAggregate()
    delete release.domains.payments
    const result = validateReleaseAggregate(release, null, vehicles)
    expect(result.outcome).toBe("BLOCKED")
    expect(result.issues.map(({ code }) => code)).toContain("release.domain_missing")
  })

  it("blocks incomplete daily, weekly, and monthly fleet coverage", () => {
    const release = validReleaseAggregate()
    release.domains["pricing-billing"]!.weeklyPricingEnabled = true
    release.domains["pricing-billing"]!.monthlyPricingEnabled = true
    release.fleetRateSet.rates = []
    const codes = validateReleaseAggregate(release, null, vehicles).issues.map(({ code }) => code)
    expect(codes).toEqual(expect.arrayContaining([
      "fleet.daily_rate_missing",
      "fleet.weekly_rate_missing",
      "fleet.monthly_rate_missing",
    ]))
  })

  it("does not report disabled weekly or monthly pricing as missing", () => {
    const release = validReleaseAggregate()
    const codes = validateReleaseAggregate(release, null, vehicles).issues.map(({ code }) => code)
    expect(codes).not.toContain("fleet.weekly_rate_missing")
    expect(codes).not.toContain("fleet.monthly_rate_missing")
  })

  it("blocks a stale draft based on an older live version", () => {
    const live = withVersion(validReleaseAggregate({ id: "active", status: "ACTIVE" }), "pricing-billing", 2)
    const draft = validReleaseAggregate()
    expect(validateReleaseAggregate(draft, live, vehicles).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "release.stale_domain_version" })]),
    )
  })

  it("preserves warning-only validation", () => {
    const release = validReleaseAggregate()
    release.domains["pricing-billing"]!.pricesIncludeTax = false
    release.domains["pricing-billing"]!.taxRateBps = 0
    const result = validateReleaseAggregate(release, null, vehicles)
    expect(result.outcome).toBe("WARNING")
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "pricing.zero_tax_excluded" })]))
  })

  it("detects changed domains and produces safe pricing examples", () => {
    const active = validReleaseAggregate({ id: "active", status: "ACTIVE" })
    const draft = withVersion(validReleaseAggregate(), "pricing-billing", 2)
    const preview = buildReleasePreview(draft, active, vehicles)
    expect(preview.changedDomains.map(({ domain }) => domain)).toEqual(["pricing-billing"])
    expect(preview.pricingExamples).toHaveLength(4)
    expect(JSON.stringify(preview)).not.toContain("canonicalContent")
    expect(JSON.stringify(preview)).not.toContain("storageKey")
  })

  it("never previews a rental shorter than the configured minimum", () => {
    const active = validReleaseAggregate({ id: "active", status: "ACTIVE" })
    const draft = withVersion(validReleaseAggregate(), "pricing-billing", 2)
    draft.domains["pricing-billing"]!.minimumRentalMinutes = 2_880
    draft.domains["pricing-billing"]!.minimumChargeDays = 2

    const preview = buildReleasePreview(draft, active, vehicles)

    expect(preview.pricingExamples.map(({ days }) => days)).toEqual([2, 7, 10, 30])
  })

  it("reports a no-change release without inventing differences", () => {
    const active = validReleaseAggregate({ id: "active", status: "ACTIVE" })
    const preview = buildReleasePreview(validReleaseAggregate(), active, vehicles)
    expect(preview.changedDomains).toHaveLength(0)
    expect(preview.pricingExamples).toHaveLength(0)
  })
})
