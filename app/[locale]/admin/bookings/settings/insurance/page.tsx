import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { InsuranceConfigurationForm } from "@/components/business-configuration/insurance-configuration-form"
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list"
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied"
import { ConfigurationReturnLink } from "@/components/admin/configuration-return-link"
import { requireAdmin } from "@/lib/auth"
import {
  ownerSettingsPageMode,
  prepareOwnerBookingExperienceEdit,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit"

export default async function InsuranceSettingsPage({ searchParams }: { searchParams: Promise<OwnerSettingsPageSearchParams> }) {
  const caps = await getBusinessConfigurationCapabilities()
  if (!caps.canView) return <ConfigurationAccessDenied />
  const { editing, nextHref } = await ownerSettingsPageMode(searchParams, "/admin/bookings/settings/flow")
  const data = editing
    ? await prepareOwnerBookingExperienceEdit((await requireAdmin()).id)
    : await loadPhase6ConfigurationPage()
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? "Edit settings" : "Business setup"}
        title="Do you offer insurance?"
        description="Turn insurance on or off, set one daily price, and choose whether customers can select it."
        action={<ConfigurationReturnLink />}
      />
      <InsuranceConfigurationForm
        key={`${data.draftInsurance?.id}-${data.draftInsurance?.revision}`}
        data={data}
        canEdit={caps.canManageInsurance}
        nextHref={nextHref}
      />
      <PricingIssueList
        title="What needs attention"
        issues={data.issues.filter((issue) => issue.domain === "insurance")}
      />
    </main>
  )
}
