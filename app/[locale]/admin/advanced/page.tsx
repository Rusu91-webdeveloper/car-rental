import {
  Activity,
  FileClock,
  HeartPulse,
  SlidersHorizontal,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SettingsLinkCard } from "@/components/admin/settings-link-card";
import { requireAdmin } from "@/lib/auth";

export default async function AdvancedPage() {
  await requireAdmin();
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="More"
        title="What else can you manage?"
        description="Publishing, reports, reviews, and system checks live here so daily work stays simple."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsLinkCard
          title="Publish changes"
          description="Review saved business changes and make them visible to customers."
          href="/admin/advanced/configuration"
          icon={SlidersHorizontal}
        />
        <SettingsLinkCard
          title="Is the business ready?"
          description="Check whether bookings, prices, messages, and secure document handling are working."
          href="/admin/health"
          icon={HeartPulse}
        />
        <SettingsLinkCard
          title="What are customers saying?"
          description="Read and manage customer reviews."
          href="/admin?section=reviews"
          icon={Activity}
        />
        <SettingsLinkCard
          title="How is the business doing?"
          description="See revenue and booking summaries."
          href="/admin?section=analytics"
          icon={FileClock}
        />
      </div>
    </main>
  );
}
