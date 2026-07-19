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
  const [overview, settingsResult, completedSteps] = await Promise.all([
    loadConfigurationOverview(),
    getCompanySettings(),
    prisma.auditEvent.findMany({
      where: {
        category: "CONFIGURATION",
        action: "owner_setup.step_completed",
        targetType: "OwnerSetupStep",
      },
      select: { targetId: true },
      distinct: ["targetId"],
    }),
  ]);
  const company = "settings" in settingsResult ? (settingsResult.settings ?? null) : null;
  const guide = buildOwnerSettingsGuide({
    company,
    overview,
    completedStepIds: completedSteps.map(({ targetId }) => targetId),
  });
  const hasSetup = Boolean(overview.activeRelease || overview.draftRelease);
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <AdminPageHeader
            eyebrow="Business settings"
            title="Let’s set up your rental business"
            description="Complete one simple step at a time. We will always show you what comes next, and you can change anything later."
          />
          {hasSetup ? (
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
          ) : null}
        </div>
      </div>
      {hasSetup ? <BusinessSetupGuide guide={guide} /> : <StartBusinessSetup />}
    </main>
  );
}
