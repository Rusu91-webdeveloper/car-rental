import { getCompanySettings } from "@/app/actions/settings";
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadNotificationConfigurationPage } from "@/lib/notification-configuration/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PaymentDetailsForm } from "@/components/admin/payment-details-form";
import { PaymentInstructionForm } from "@/components/business-configuration/notification-configuration-form";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import {
  ownerSettingsPageMode,
  prepareOwnerNotificationEdit,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<OwnerSettingsPageSearchParams> }) {
  const [caps, user] = await Promise.all([
    getBusinessConfigurationCapabilities(),
    getCurrentUser(),
  ]);
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const { editing, nextHref } = await ownerSettingsPageMode(searchParams, "/admin/settings/notifications");
  const [settingsResult, data] = await Promise.all([
    user?.role === "ADMIN" ? getCompanySettings() : Promise.resolve(null),
    editing
      ? prepareOwnerNotificationEdit((await requireAdmin()).id)
      : loadNotificationConfigurationPage(),
  ]);
  if (
    settingsResult &&
    (!("settings" in settingsResult) || !settingsResult.settings)
  )
    throw new Error(
      settingsResult.error ?? "Payment settings are unavailable.",
    );
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? "Edit settings" : "Business setup"}
        title="How can customers pay?"
        description="Set the bank details and instructions customers receive after booking."
      />
      {settingsResult?.settings ? (
        <PaymentDetailsForm value={settingsResult.settings} />
      ) : null}
      <PaymentInstructionForm
        key={`${data.draftPayment?.id ?? "live"}-${data.draftPayment?.revision ?? 0}`}
        data={data}
        canEdit={caps.canManagePayments}
        nextHref={nextHref}
      />
    </main>
  );
}
