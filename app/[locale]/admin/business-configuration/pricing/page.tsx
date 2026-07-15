import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadPricingConfigurationPage } from "@/lib/pricing-admin/service"
import { DraftLivePricingComparison } from "@/components/business-configuration/draft-live-pricing-comparison"
import { PricingDraftControls } from "@/components/business-configuration/pricing-draft-controls"
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list"
import { PricingSummaryCard } from "@/components/business-configuration/pricing-summary-card"
import { PricingVersionHeader } from "@/components/business-configuration/pricing-version-header"
import { QuotePreviewPanel } from "@/components/business-configuration/quote-preview-panel"
import { VehicleRateTable } from "@/components/business-configuration/vehicle-rate-table"

export const dynamic = "force-dynamic"

export default async function PricingConfigurationPage() {
  const [capabilities, data] = await Promise.all([
    getBusinessConfigurationCapabilities(),
    loadPricingConfigurationPage(),
  ])
  return <div className="space-y-6"><PricingVersionHeader data={data} title="Pricing" description="Set exact daily, weekly, and fixed-month prices for each vehicle. Draft changes are separate from validation and never become live without explicit release activation." /><PricingDraftControls data={data} canManage={capabilities.canManagePricing} canValidate={capabilities.canValidate} /><PricingSummaryCard coverage={data.coverage} currency={data.currency} />{data.draftFleet ? <VehicleRateTable key={`${data.draftFleet.id}-${data.draftFleet.revision}`} vehicles={data.vehicles} fleetRateSetId={data.draftFleet.id} revision={data.draftFleet.revision} currency={data.currency} canManage={capabilities.canManagePricing} /> : null}<QuotePreviewPanel data={data} /><DraftLivePricingComparison data={data} /><PricingIssueList issues={data.issues} /></div>
}
