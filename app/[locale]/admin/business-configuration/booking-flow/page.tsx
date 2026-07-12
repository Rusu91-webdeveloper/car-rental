import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service"
import { Phase6PageHeader } from "@/components/business-configuration/phase6-page-header"
import { Phase6DraftControls } from "@/components/business-configuration/phase6-draft-controls"
import { BookingFlowStepList } from "@/components/business-configuration/booking-flow-step-list"
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list"
import { Phase6DraftLiveComparison } from "@/components/business-configuration/phase6-draft-live-comparison"
export const dynamic = "force-dynamic"
export default async function BookingFlowPage() {
  const [caps, data] = await Promise.all([getBusinessConfigurationCapabilities(), loadPhase6ConfigurationPage()])
  return (
    <div className="space-y-6">
      <Phase6PageHeader
        title="Booking flow"
        description="Configure only the supported booking steps. Documents and legal acceptance remain unavailable in Phase 6."
        live={data.liveWorkflow?.versionNumber}
        draft={data.draftWorkflow?.versionNumber}
      />
      <Phase6DraftControls
        data={data}
        domain="BOOKING_WORKFLOW"
        hasDraft={Boolean(data.draftWorkflow)}
        canCreate={caps.canManageBookingWorkflow}
        canValidate={caps.canValidate}
        canAttach={caps.canEdit}
      />
      <Phase6DraftLiveComparison
        live={data.liveWorkflow}
        draft={data.draftWorkflow}
        impact="Changes supported booking-step visibility while keeping vehicle, customer, driver, review, and confirmation safeguards."
      />
      <BookingFlowStepList
        key={`${data.draftWorkflow?.id}-${data.draftWorkflow?.revision}`}
        data={data}
        canEdit={caps.canManageBookingWorkflow}
      />
      <PricingIssueList
        title="Booking flow checks"
        issues={data.issues.filter((issue) => issue.domain === "booking-workflow")}
      />
    </div>
  )
}
