import { Bell, Building2, Car, FileText, ShieldCheck, SlidersHorizontal, WalletCards } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SettingsLinkCard } from "@/components/admin/settings-link-card";
import { StartBusinessSetup } from "@/components/admin/start-business-setup";
import { requireAdmin } from "@/lib/auth";
import { loadConfigurationOverview } from "@/lib/business-configuration/workflow-service";

export default async function BusinessSettingsPage() {
  await requireAdmin();
  const overview = await loadConfigurationOverview();
  const hasSetup = Boolean(overview.activeRelease || overview.draftRelease);
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Settings"
        title="Set up your rental business"
        description="Complete these steps from top to bottom. Add cars after your business-wide rules are ready."
      />
      {!hasSetup ? <StartBusinessSetup /> : null}
      {hasSetup && !overview.activeRelease ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Your setup is saved but not live yet.</p>
          <p className="mt-1">Finish every essential step, add your cars, then review and publish once.</p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SettingsLinkCard
          title="1. Business details"
          description="Company name, customer contact details, address, and currency."
          href="/admin/settings/profile"
          icon={Building2}
          badge="Essential"
        />
        <SettingsLinkCard
          title="2. Booking and tax"
          description="Minimum booking days, tax percentage, and how rental days are counted."
          href="/admin/bookings/settings/duration"
          icon={SlidersHorizontal}
          badge="Essential"
        />
        <SettingsLinkCard
          title="3. Insurance"
          description="Choose whether insurance is offered and set its daily price."
          href="/admin/bookings/settings/insurance"
          icon={ShieldCheck}
          badge="Essential"
        />
        <SettingsLinkCard
          title="4. Payments and deposit"
          description="Deposit percentage, payment methods, and customer instructions."
          href="/admin/payments"
          icon={WalletCards}
          badge="Essential"
        />
        <SettingsLinkCard
          title="5. Booking details"
          description="Customer steps, driver rules, and information you need."
          href="/admin/bookings/settings"
          icon={FileText}
          badge="Essential"
        />
        <SettingsLinkCard
          title="6. Customer messages"
          description="Notification addresses and booking confirmation text."
          href="/admin/settings/notifications"
          icon={Bell}
        />
        <SettingsLinkCard
          title="7. Add your cars"
          description="New cars automatically inherit the business rules above."
          href="/admin?section=cars"
          icon={Car}
          badge="Essential"
        />
        <SettingsLinkCard
          title="8. Review and publish"
          description="See anything missing and make the complete setup live."
          href="/admin/advanced/configuration"
          icon={ShieldCheck}
          badge="Final step"
        />
      </div>
    </main>
  );
}
