import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service"
import { Phase6PageHeader } from "@/components/business-configuration/phase6-page-header"
import { Phase6DraftControls } from "@/components/business-configuration/phase6-draft-controls"
import { CustomerFieldRequirementTable } from "@/components/business-configuration/customer-field-requirement-table"
import { Phase6DraftLiveComparison } from "@/components/business-configuration/phase6-draft-live-comparison"
export const dynamic = "force-dynamic"
export default async function CustomerInformationPage() {
  const [caps, data] = await Promise.all([getBusinessConfigurationCapabilities(), loadPhase6ConfigurationPage()])
  return (
    <div className="space-y-6">
      <Phase6PageHeader
        title="Customer information"
        description="Choose required, optional, or hidden modes from the approved typed field set."
        live={data.liveCustomerDriver?.versionNumber}
        draft={data.draftCustomerDriver?.versionNumber}
      />
      <Phase6DraftControls
        data={data}
        domain="CUSTOMER_DRIVER_REQUIREMENTS"
        hasDraft={Boolean(data.draftCustomerDriver)}
        canCreate={caps.canManageCustomerFields}
        canValidate={caps.canValidate}
        canAttach={caps.canEdit}
      />
      <Phase6DraftLiveComparison
        live={data.liveCustomerDriver}
        draft={data.draftCustomerDriver}
        impact="Changes which supported customer and driver fields future bookings show or require."
      />
      <CustomerFieldRequirementTable
        key={`${data.draftCustomerDriver?.id}-${data.draftCustomerDriver?.revision}`}
        data={data}
        canEdit={caps.canManageCustomerFields}
      />
    </div>
  )
}
