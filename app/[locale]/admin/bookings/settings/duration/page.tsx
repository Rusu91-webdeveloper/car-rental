import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadPricingConfigurationPage } from "@/lib/pricing-admin/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { BillingRuleForm } from "@/components/business-configuration/billing-rule-form";
import { PricingDraftControls } from "@/components/business-configuration/pricing-draft-controls";
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";

export default async function RentalDurationSettingsPage() {
  const caps = await getBusinessConfigurationCapabilities();
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const data = await loadPricingConfigurationPage();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Business setup"
        title="Set your booking length and tax"
        description="Enter the minimum number of days and your tax once. These rules apply automatically to every car."
      />
      <PricingDraftControls
        data={data}
        canManage={caps.canManagePricing}
        canValidate={caps.canValidate}
      />
      <BillingRuleForm
        key={`${data.draftPricing?.id ?? "none"}-${data.draftPricing?.revision ?? 0}`}
        data={data}
        canManage={caps.canManagePricing}
      />
      <PricingIssueList title="What needs attention" issues={data.issues} />
    </main>
  );
}
