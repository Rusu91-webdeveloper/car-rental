import { CheckCircle2, CircleAlert } from "lucide-react";
import { getCompanySettings } from "@/app/actions/settings";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { BusinessSetupGuide } from "@/components/admin/business-setup-guide";
import { StartBusinessSetup } from "@/components/admin/start-business-setup";
import { requireAdmin } from "@/lib/auth";
import { buildOwnerSettingsGuide } from "@/lib/admin/owner-settings-guide";
import { loadConfigurationOverview } from "@/lib/business-configuration/workflow-service";
import { prisma } from "@/lib/db";

export default async function BusinessSettingsPage() {
  await requireAdmin();
  const [overview, settingsResult, activeCarCount] = await Promise.all([
    loadConfigurationOverview(),
    getCompanySettings(),
    prisma.car.count({ where: { isDeleted: false } }),
  ]);
  const company = "settings" in settingsResult ? (settingsResult.settings ?? null) : null;
  const guide = buildOwnerSettingsGuide({ company, activeCarCount, overview });
  const hasSetup = Boolean(overview.activeRelease || overview.draftRelease);
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl border bg-background p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <AdminPageHeader
            eyebrow="Business settings"
            title="Set up your rental business"
            description="A simple checklist for everything customers need. Follow it once, then return anytime to make changes."
          />
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> {guide.completed} complete
            </span>
            {guide.attentionCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
                <CircleAlert className="h-3.5 w-3.5" /> {guide.attentionCount} need attention
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {!hasSetup ? <StartBusinessSetup /> : null}
      <BusinessSetupGuide
        guide={guide}
        blockers={overview.blockers}
        warnings={overview.warnings}
        isLive={Boolean(overview.activeRelease)}
      />
    </main>
  );
}
