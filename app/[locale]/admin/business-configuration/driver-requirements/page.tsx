import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service"
import { Phase6PageHeader } from "@/components/business-configuration/phase6-page-header"
import { Phase6DraftControls } from "@/components/business-configuration/phase6-draft-controls"
import { DriverRequirementsForm } from "@/components/business-configuration/driver-requirements-form"
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list"
import { Phase6DraftLiveComparison } from "@/components/business-configuration/phase6-draft-live-comparison"
export const dynamic = "force-dynamic"
export default async function DriverRequirementsPage() {
  const [caps, data] = await Promise.all([getBusinessConfigurationCapabilities(), loadPhase6ConfigurationPage()])
  return (
    <div className="space-y-6">
      <Phase6PageHeader
        title="Driver requirements"
        description="Configure calendar-aware age and driving-licence eligibility rules."
        live={data.liveCustomerDriver?.versionNumber}
        draft={data.draftCustomerDriver?.versionNumber}
      />
      <Phase6DraftControls
        data={data}
        domain="CUSTOMER_DRIVER_REQUIREMENTS"
        hasDraft={Boolean(data.draftCustomerDriver)}
        canCreate={caps.canManageDriverRequirements}
        canValidate={caps.canValidate}
        canAttach={caps.canEdit}
      />
      <Phase6DraftLiveComparison
        live={data.liveCustomerDriver}
        draft={data.draftCustomerDriver}
        impact="Changes future driver eligibility outcomes and the fields needed to prove eligibility."
      />
      <DriverRequirementsForm
        key={`${data.draftCustomerDriver?.id}-${data.draftCustomerDriver?.revision}`}
        data={data}
        canEdit={caps.canManageDriverRequirements}
      />
      <PricingIssueList
        title="Driver requirement checks"
        issues={data.issues.filter((issue) => issue.domain === "customer-driver-requirements")}
      />
    </div>
  )
}
