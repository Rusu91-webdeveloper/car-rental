import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadPricingConfigurationPage } from "@/lib/pricing-admin/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { BillingRuleForm } from "@/components/business-configuration/billing-rule-form";
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";
import { requireAdmin } from "@/lib/auth";
import {
  ownerSettingsPageMode,
  prepareOwnerPricingEdit,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit";

export default async function RentalDurationSettingsPage({ searchParams }: { searchParams: Promise<OwnerSettingsPageSearchParams> }) {
  const caps = await getBusinessConfigurationCapabilities();
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const { editing, nextHref } = await ownerSettingsPageMode(searchParams, "/admin/bookings/settings/insurance");
  const data = editing
    ? await prepareOwnerPricingEdit((await requireAdmin()).id)
    : await loadPricingConfigurationPage();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? "Edit settings" : "Business setup"}
        title="Set your booking length and tax"
        description="Enter the minimum number of days and your tax once. These rules apply automatically to every car."
      />
      <BillingRuleForm
        key={`${data.draftPricing?.id ?? "none"}-${data.draftPricing?.revision ?? 0}`}
        data={data}
        canManage={caps.canManagePricing}
        nextHref={nextHref}
      />
      <PricingIssueList title="What needs attention" issues={data.issues} />
    </main>
  );
}
