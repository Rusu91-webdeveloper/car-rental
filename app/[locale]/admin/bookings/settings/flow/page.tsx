import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Phase6DraftControls } from "@/components/business-configuration/phase6-draft-controls";
import { BookingFlowStepList } from "@/components/business-configuration/booking-flow-step-list";
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";

export default async function BookingFlowSettingsPage() {
  const caps = await getBusinessConfigurationCapabilities();
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const data = await loadPhase6ConfigurationPage();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Bookings"
        title="What steps do customers complete?"
        description="Choose what customers see before they send a booking request."
      />
      <Phase6DraftControls
        data={data}
        domain="BOOKING_WORKFLOW"
        hasDraft={Boolean(data.draftWorkflow)}
        canCreate={caps.canManageBookingWorkflow}
        canValidate={caps.canValidate}
        canAttach={caps.canEdit}
      />
      <BookingFlowStepList
        key={`${data.draftWorkflow?.id}-${data.draftWorkflow?.revision}`}
        data={data}
        canEdit={caps.canManageBookingWorkflow}
      />
      <PricingIssueList
        title="What needs attention"
        issues={data.issues.filter(
          (issue) => issue.domain === "booking-workflow",
        )}
      />
    </main>
  );
}
