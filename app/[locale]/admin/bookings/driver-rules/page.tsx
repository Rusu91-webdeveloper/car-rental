import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DriverRequirementsForm } from "@/components/business-configuration/driver-requirements-form";
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";
import { requireAdmin } from "@/lib/auth";
import {
  ownerSettingsPageMode,
  prepareOwnerBookingExperienceEdit,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit";

export default async function DriverRulesPage({ searchParams }: { searchParams: Promise<OwnerSettingsPageSearchParams> }) {
  const caps = await getBusinessConfigurationCapabilities();
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const { editing, nextHref } = await ownerSettingsPageMode(searchParams, "/admin/customers/settings");
  const data = editing
    ? await prepareOwnerBookingExperienceEdit((await requireAdmin()).id)
    : await loadPhase6ConfigurationPage();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? "Edit settings" : "Business setup"}
        title="Who is allowed to drive?"
        description="Set the age and licence rules every driver must meet."
      />
      <DriverRequirementsForm
        key={`${data.draftCustomerDriver?.id}-${data.draftCustomerDriver?.revision}`}
        data={data}
        canEdit={caps.canManageDriverRequirements}
        nextHref={nextHref}
      />
      <PricingIssueList
        title="What needs attention"
        issues={data.issues.filter(
          (issue) => issue.domain === "customer-driver-requirements",
        )}
      />
    </main>
  );
}
