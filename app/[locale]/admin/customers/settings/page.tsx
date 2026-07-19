import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CustomerFieldRequirementTable } from "@/components/business-configuration/customer-field-requirement-table";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";
import { requireAdmin } from "@/lib/auth";
import {
  ownerSettingsPageMode,
  prepareOwnerBookingExperienceEdit,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit";

export default async function CustomerSettingsPage({ searchParams }: { searchParams: Promise<OwnerSettingsPageSearchParams> }) {
  const caps = await getBusinessConfigurationCapabilities();
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const { editing, nextHref } = await ownerSettingsPageMode(searchParams, "/admin/documents/settings");
  const data = editing
    ? await prepareOwnerBookingExperienceEdit((await requireAdmin()).id)
    : await loadPhase6ConfigurationPage();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? "Edit settings" : "Business setup"}
        title="What information do you need from customers?"
        description="Choose which customer and driver details are required, optional, or hidden."
      />
      <CustomerFieldRequirementTable
        key={`${data.draftCustomerDriver?.id}-${data.draftCustomerDriver?.revision}`}
        data={data}
        canEdit={caps.canManageCustomerFields}
        nextHref={nextHref}
      />
    </main>
  );
}
