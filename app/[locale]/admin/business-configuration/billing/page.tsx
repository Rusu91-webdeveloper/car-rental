import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadPricingConfigurationPage } from "@/lib/pricing-admin/service"
import { BillingRuleForm } from "@/components/business-configuration/billing-rule-form"
import { DraftLivePricingComparison } from "@/components/business-configuration/draft-live-pricing-comparison"
import { PricingDraftControls } from "@/components/business-configuration/pricing-draft-controls"
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list"
import { PricingVersionHeader } from "@/components/business-configuration/pricing-version-header"
import { QuotePreviewPanel } from "@/components/business-configuration/quote-preview-panel"

export const dynamic = "force-dynamic"

export default async function BillingConfigurationPage() {
  const [capabilities, data] = await Promise.all([
    getBusinessConfigurationCapabilities(),
    loadPricingConfigurationPage(),
  ])
  return <div className="space-y-6"><PricingVersionHeader data={data} title="Booking schedule and billing rules" description="Configure customer handover hours and capacity, then choose how rental duration becomes billable days and how daily, weekly, and fixed-month prices are combined." /><PricingDraftControls data={data} canManage={capabilities.canManagePricing} canValidate={capabilities.canValidate} /><BillingRuleForm key={`${data.draftPricing?.id ?? "none"}-${data.draftPricing?.revision ?? 0}`} data={data} canManage={capabilities.canManagePricing} /><QuotePreviewPanel data={data} /><DraftLivePricingComparison data={data} /><PricingIssueList issues={data.issues} title="Schedule, billing and strategy checks" /></div>
}
