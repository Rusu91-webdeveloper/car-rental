import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadNotificationConfigurationPage } from "@/lib/notification-configuration/service";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PaymentInstructionForm } from "@/components/business-configuration/notification-configuration-form";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";
import { ConfigurationReturnLink } from "@/components/admin/configuration-return-link";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import {
  ownerSettingsPageMode,
  prepareOwnerNotificationEdit,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit";
import { prisma } from "@/lib/db";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<OwnerSettingsPageSearchParams> }) {
  const [caps, user] = await Promise.all([
    getBusinessConfigurationCapabilities(),
    getCurrentUser(),
  ]);
  if (!caps.canView) return <ConfigurationAccessDenied />;
  const { editing, nextHref } = await ownerSettingsPageMode(searchParams, "/admin/settings/notifications");
  const [settings, data] = await Promise.all([
    user?.role === "ADMIN" || caps.canManagePayments
      ? prisma.companySettings.findUnique({ where: { id: "company-settings" } })
      : Promise.resolve(null),
    editing
      ? prepareOwnerNotificationEdit((await requireAdmin()).id)
      : loadNotificationConfigurationPage(),
  ]);
  if (!settings) throw new Error("Payment settings are unavailable.");
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? "Edit settings" : "Business setup"}
        title="How can customers pay?"
        description="Set the bank details and instructions customers receive after booking."
        action={<ConfigurationReturnLink />}
      />
      <PaymentInstructionForm
        key={`${data.draftPayment?.id ?? "live"}-${data.draftPayment?.revision ?? 0}`}
        data={data}
        paymentProfile={settings}
        canEdit={caps.canManagePayments}
        nextHref={nextHref}
      />
    </main>
  );
}
