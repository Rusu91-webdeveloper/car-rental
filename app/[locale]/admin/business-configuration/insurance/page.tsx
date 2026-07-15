import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service"
import { Phase6PageHeader } from "@/components/business-configuration/phase6-page-header"
import { Phase6DraftControls } from "@/components/business-configuration/phase6-draft-controls"
import { InsuranceConfigurationForm } from "@/components/business-configuration/insurance-configuration-form"
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list"
import { Phase6DraftLiveComparison } from "@/components/business-configuration/phase6-draft-live-comparison"
export const dynamic = "force-dynamic"
export default async function InsurancePage() {
  const [caps, data] = await Promise.all([getBusinessConfigurationCapabilities(), loadPhase6ConfigurationPage()])
  return (
    <div className="space-y-6">
      <Phase6PageHeader
        title="Insurance"
        description="Configure Vollkasko availability and exact per-day pricing for future bookings."
        live={data.liveInsurance?.versionNumber}
        draft={data.draftInsurance?.versionNumber}
      />
      <Phase6DraftControls
        data={data}
        domain="INSURANCE"
        hasDraft={Boolean(data.draftInsurance)}
        canCreate={caps.canManageInsurance}
        canValidate={caps.canValidate}
        canAttach={caps.canEdit}
      />
      <Phase6DraftLiveComparison
        live={data.liveInsurance}
        draft={data.draftInsurance}
        impact="Changes insurance visibility, selection behavior, vehicle coverage, and the authoritative booking total."
      />
      <InsuranceConfigurationForm
        key={`${data.draftInsurance?.id}-${data.draftInsurance?.revision}`}
        data={data}
        canEdit={caps.canManageInsurance}
      />
      <PricingIssueList title="Insurance checks" issues={data.issues.filter((issue) => issue.domain === "insurance")} />
    </div>
  )
}
