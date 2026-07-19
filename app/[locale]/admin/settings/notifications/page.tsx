import { getCompanySettings } from "@/app/actions/settings";
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadNotificationConfigurationPage } from "@/lib/notification-configuration/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { NotificationContactsForm } from "@/components/admin/notification-contacts-form";
import { ConfirmationContentForm } from "@/components/business-configuration/confirmation-content-form";
import { requireAdmin } from "@/lib/auth";
import {
  ownerSettingsPageMode,
  prepareOwnerNotificationEdit,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit";

export default async function NotificationSettingsPage({ searchParams }: { searchParams: Promise<OwnerSettingsPageSearchParams> }) {
  const admin = await requireAdmin();
  const { editing, nextHref } = await ownerSettingsPageMode(searchParams, "/admin/settings/legal");
  const [settingsResult, caps, data] = await Promise.all([
    getCompanySettings(),
    getBusinessConfigurationCapabilities(),
    editing ? prepareOwnerNotificationEdit(admin.id) : loadNotificationConfigurationPage(),
  ]);
  if (!("settings" in settingsResult) || !settingsResult.settings)
    throw new Error(
      settingsResult.error ?? "Notification settings are unavailable.",
    );
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? "Edit settings" : "Business setup"}
        title="What should booking messages say?"
        description="Choose where replies go and what customers read in their confirmation."
      />
      <NotificationContactsForm
        supportEmail={settingsResult.settings.supportEmail}
        adminEmail={settingsResult.settings.adminEmail}
      />
      <ConfirmationContentForm
        key={`${data.draftConfirmation?.id ?? "live"}-${data.draftConfirmation?.revision ?? 0}`}
        data={data}
        canEdit={caps.canManageConfirmations}
        nextHref={nextHref}
      />
    </main>
  );
}
