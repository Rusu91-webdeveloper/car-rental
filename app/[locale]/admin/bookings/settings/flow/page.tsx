import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { BookingFlowStepList } from "@/components/business-configuration/booking-flow-step-list";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";
import { requireAdmin } from "@/lib/auth";
import {
  ownerSettingsPageMode,
  loadOwnerBookingWorkflowDependencies,
  prepareOwnerBookingExperienceEdit,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit";

export default async function BookingFlowSettingsPage({ searchParams }: { searchParams: Promise<OwnerSettingsPageSearchParams> }) {
  const caps = await getBusinessConfigurationCapabilities();
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const { editing, nextHref } = await ownerSettingsPageMode(searchParams, "/admin/bookings/driver-rules");
  const data = editing
    ? await prepareOwnerBookingExperienceEdit((await requireAdmin()).id)
    : await loadPhase6ConfigurationPage();
  const { documents, legal, dependencyKey } = await loadOwnerBookingWorkflowDependencies(data.draftRelease?.id);
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? "Edit settings" : "Business setup"}
        title="What steps do customers complete?"
        description="Choose what customers see before they send a booking request."
      />
      <BookingFlowStepList
        key={`${data.draftWorkflow?.id}-${data.draftWorkflow?.revision}-${dependencyKey}`}
        data={data}
        documents={documents}
        legal={legal}
        canEdit={caps.canManageBookingWorkflow}
        nextHref={nextHref}
      />
    </main>
  );
}
