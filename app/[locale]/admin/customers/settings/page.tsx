import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Phase6DraftControls } from "@/components/business-configuration/phase6-draft-controls";
import { CustomerFieldRequirementTable } from "@/components/business-configuration/customer-field-requirement-table";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";

export default async function CustomerSettingsPage() {
  const caps = await getBusinessConfigurationCapabilities();
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const data = await loadPhase6ConfigurationPage();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Customers"
        title="What information do you need from customers?"
        description="Choose which customer and driver details are required, optional, or hidden."
      />
      <Phase6DraftControls
        data={data}
        domain="CUSTOMER_DRIVER_REQUIREMENTS"
        hasDraft={Boolean(data.draftCustomerDriver)}
        canCreate={caps.canManageCustomerFields}
        canValidate={caps.canValidate}
        canAttach={caps.canEdit}
      />
      <CustomerFieldRequirementTable
        key={`${data.draftCustomerDriver?.id}-${data.draftCustomerDriver?.revision}`}
        data={data}
        canEdit={caps.canManageCustomerFields}
      />
    </main>
  );
}
