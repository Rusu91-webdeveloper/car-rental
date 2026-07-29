import { getCompanySettings } from "@/app/actions/settings";
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadNotificationConfigurationPage } from "@/lib/notification-configuration/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ConfigurationReturnLink } from "@/components/admin/configuration-return-link";
import { NotificationContactsForm } from "@/components/admin/notification-contacts-form";
import { ConfirmationContentForm } from "@/components/business-configuration/confirmation-content-form";
import { requireAdmin } from "@/lib/auth";
import {
  ownerSettingsPageMode,
  prepareOwnerNotificationEdit,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit";

export default async function NotificationSettingsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<OwnerSettingsPageSearchParams> }) {
  const de = (await params).locale === "de";
  const admin = await requireAdmin();
  const { editing, nextHref } = await ownerSettingsPageMode(searchParams, "/admin/settings/legal");
  const [settingsResult, caps, data] = await Promise.all([
    getCompanySettings(),
    getBusinessConfigurationCapabilities(),
    editing ? prepareOwnerNotificationEdit(admin.id) : loadNotificationConfigurationPage(),
  ]);
  if (!("settings" in settingsResult) || !settingsResult.settings)
    throw new Error(
      settingsResult.error ?? (de ? "Die Benachrichtigungseinstellungen sind nicht verfügbar." : "Notification settings are unavailable."),
    );
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? (de ? "Einstellungen bearbeiten" : "Edit settings") : (de ? "Unternehmenseinrichtung" : "Business setup")}
        title={de ? "Was soll in Buchungsnachrichten stehen?" : "What should booking messages say?"}
        description={de ? "Legen Sie fest, wohin Antworten gehen und was Kunden in ihrer Bestätigung lesen." : "Choose where replies go and what customers read in their confirmation."}
        action={<ConfigurationReturnLink />}
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
