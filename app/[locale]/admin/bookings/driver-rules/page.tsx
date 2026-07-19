import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Phase6DraftControls } from "@/components/business-configuration/phase6-draft-controls";
import { DriverRequirementsForm } from "@/components/business-configuration/driver-requirements-form";
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";

export default async function DriverRulesPage() {
  const caps = await getBusinessConfigurationCapabilities();
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const data = await loadPhase6ConfigurationPage();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Bookings"
        title="Who is allowed to drive?"
        description="Set the age and licence rules every driver must meet."
      />
      <Phase6DraftControls
        data={data}
        domain="CUSTOMER_DRIVER_REQUIREMENTS"
        hasDraft={Boolean(data.draftCustomerDriver)}
        canCreate={caps.canManageDriverRequirements}
        canValidate={caps.canValidate}
        canAttach={caps.canEdit}
      />
      <DriverRequirementsForm
        key={`${data.draftCustomerDriver?.id}-${data.draftCustomerDriver?.revision}`}
        data={data}
        canEdit={caps.canManageDriverRequirements}
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
