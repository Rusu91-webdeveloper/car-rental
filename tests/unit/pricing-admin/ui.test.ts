import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PricingStrategySelector } from "@/components/business-configuration/pricing-strategy-selector"
import { PricingSummaryCard } from "@/components/business-configuration/pricing-summary-card"
import { DraftLivePricingComparison } from "@/components/business-configuration/draft-live-pricing-comparison"
import { buildPricingAdminPageData } from "@/lib/pricing-admin/service"
import { pricingWorkspaceRecords } from "../../helpers/pricing-admin-fixtures"

describe("pricing admin UI", () => {
  it("uses plain-language strategy labels instead of raw enum names", () => {
    const markup = renderToStaticMarkup(createElement(PricingStrategySelector, { value: "DAILY_ONLY", onChange: () => undefined }))
    expect(markup).toContain("Charge every rental day separately")
    expect(markup).toContain("Automatically use the lowest valid price")
    expect(markup).not.toContain("LOWEST_VALID_TOTAL")
  })

  it("shows missing-rate coverage clearly", () => {
    const markup = renderToStaticMarkup(createElement(PricingSummaryCard, { coverage: { totalActiveVehicles: 2, dailyRates: 1, weeklyRates: 0, monthlyRates: 0, missingRequiredRates: 1, vehiclesNotInDraft: 1, currencyConsistent: true, blockers: 1, warnings: 0 }, currency: "EUR" }))
    expect(markup).toContain("Missing required")
    expect(markup).toContain("1 blockers")
  })

  it("renders exact live/draft differences without a fabricated percentage", () => {
    const data = buildPricingAdminPageData(pricingWorkspaceRecords())
    const markup = renderToStaticMarkup(createElement(DraftLivePricingComparison, { data }))
    expect(markup).toContain("Fixture Car")
    expect(markup).not.toContain("Infinity")
    expect(markup).not.toContain("NaN")
  })
})
