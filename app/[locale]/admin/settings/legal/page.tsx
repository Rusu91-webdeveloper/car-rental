import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadLegalAdministrationPage } from "@/lib/legal/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { LegalDocumentList } from "@/components/legal/legal-document-list";
import { LegalAcceptanceConfigurationForm } from "@/components/legal/legal-acceptance-configuration-form";
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";

export default async function LegalSettingsPage() {
  const caps = await getBusinessConfigurationCapabilities();
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const data = await loadLegalAdministrationPage();
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Settings"
        title="What must customers agree to?"
        description="Keep your rental terms and privacy notice up to date for every booking."
      />
      <LegalDocumentList
        data={data}
        canEdit={caps.canEditLegal}
        canPublish={caps.canPublishLegal}
        canValidate={caps.canValidate}
      />
      <LegalAcceptanceConfigurationForm
        data={data}
        canEdit={caps.canEditLegal}
        canValidate={caps.canValidate}
        canAttach={caps.canEdit}
      />
      <PricingIssueList title="What needs attention" issues={data.issues} />
    </main>
  );
}
