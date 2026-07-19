import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadPricingConfigurationPage } from "@/lib/pricing-admin/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PricingDraftControls } from "@/components/business-configuration/pricing-draft-controls";
import { PricingSummaryCard } from "@/components/business-configuration/pricing-summary-card";
import { VehicleRateTable } from "@/components/business-configuration/vehicle-rate-table";
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";

export default async function CarPricingPage() {
  const caps = await getBusinessConfigurationCapabilities();
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const data = await loadPricingConfigurationPage();
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Cars"
        title="What should each car cost?"
        description="Set daily, weekly, and monthly prices. Customers keep seeing current prices until you publish the changes."
      />
      <PricingDraftControls
        data={data}
        canManage={caps.canManagePricing}
        canValidate={caps.canValidate}
      />
      <PricingSummaryCard coverage={data.coverage} currency={data.currency} />
      {data.draftFleet ? (
        <VehicleRateTable
          key={`${data.draftFleet.id}-${data.draftFleet.revision}`}
          vehicles={data.vehicles}
          fleetRateSetId={data.draftFleet.id}
          revision={data.draftFleet.revision}
          currency={data.currency}
          canManage={caps.canManagePricing}
        />
      ) : null}
      <PricingIssueList title="What needs attention" issues={data.issues} />
    </main>
  );
}
