import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Phase6DraftControls } from "@/components/business-configuration/phase6-draft-controls";
import { InsuranceConfigurationForm } from "@/components/business-configuration/insurance-configuration-form";
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";
import { ConfigurationReturnLink } from "@/components/admin/configuration-return-link";

export default async function CarRentalRulesPage() {
  const caps = await getBusinessConfigurationCapabilities();
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const data = await loadPhase6ConfigurationPage();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Cars"
        title="Should customers be offered insurance?"
        description="Choose the price, whether it is optional, and which cars offer it."
        action={<ConfigurationReturnLink />}
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
  );
}
