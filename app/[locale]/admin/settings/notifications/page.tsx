import { getCompanySettings } from "@/app/actions/settings";
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadNotificationConfigurationPage } from "@/lib/notification-configuration/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { NotificationContactsForm } from "@/components/admin/notification-contacts-form";
import { NotificationDraftControl } from "@/components/business-configuration/notification-draft-control";
import { ConfirmationContentForm } from "@/components/business-configuration/confirmation-content-form";
import { requireAdmin } from "@/lib/auth";

export default async function NotificationSettingsPage() {
  await requireAdmin();
  const [settingsResult, caps, data] = await Promise.all([
    getCompanySettings(),
    getBusinessConfigurationCapabilities(),
    loadNotificationConfigurationPage(),
  ]);
  if (!("settings" in settingsResult) || !settingsResult.settings)
    throw new Error(
      settingsResult.error ?? "Notification settings are unavailable.",
    );
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Settings"
        title="What should booking messages say?"
        description="Choose where replies go and what customers read in their confirmation."
      />
      <NotificationContactsForm
        supportEmail={settingsResult.settings.supportEmail}
        adminEmail={settingsResult.settings.adminEmail}
      />
      <NotificationDraftControl
        key={data.draftRelease?.revision ?? "no-draft"}
        data={data}
        canEdit={
          caps.canEdit && caps.canManagePayments && caps.canManageConfirmations
        }
      />
      <ConfirmationContentForm
        key={`${data.draftConfirmation?.id ?? "live"}-${data.draftConfirmation?.revision ?? 0}`}
        data={data}
        canEdit={caps.canManageConfirmations}
      />
    </main>
  );
}
