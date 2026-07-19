import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { Phase6DraftControls } from "@/components/business-configuration/phase6-draft-controls"
import { InsuranceConfigurationForm } from "@/components/business-configuration/insurance-configuration-form"
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list"
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied"

export default async function InsuranceSettingsPage() {
  const caps = await getBusinessConfigurationCapabilities()
  if (!caps.canView) return <ConfigurationAccessDenied />
  const data = await loadPhase6ConfigurationPage()
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Business setup"
        title="Do you offer insurance?"
        description="Turn insurance on or off, set one daily price, and choose whether customers can select it."
      />
      <Phase6DraftControls
        data={data}
        domain="INSURANCE"
        hasDraft={Boolean(data.draftInsurance)}
        canCreate={caps.canManageInsurance}
        canValidate={caps.canValidate}
        canAttach={caps.canEdit}
      />
      <InsuranceConfigurationForm
        key={`${data.draftInsurance?.id}-${data.draftInsurance?.revision}`}
        data={data}
        canEdit={caps.canManageInsurance}
      />
      <PricingIssueList
        title="What needs attention"
        issues={data.issues.filter((issue) => issue.domain === "insurance")}
      />
    </main>
  )
}
