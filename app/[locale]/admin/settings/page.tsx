import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import Link from "@/navigation";
import { getCompanySettings } from "@/app/actions/settings";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { BusinessSetupGuide } from "@/components/admin/business-setup-guide";
import { OwnerSettingsStepContent } from "@/components/admin/owner-settings-step-content";
import { OwnerSettingsWizard } from "@/components/admin/owner-settings-wizard";
import { OwnerSetupActivationRecovery } from "@/components/admin/owner-setup-activation-recovery";
import { StartBusinessSetup } from "@/components/admin/start-business-setup";
import { requireAdmin } from "@/lib/auth";
import { buildOwnerSettingsGuide } from "@/lib/admin/owner-settings-guide";
import { loadConfigurationOverview } from "@/lib/business-configuration/workflow-service";
import { prisma } from "@/lib/db";

interface BusinessSettingsSearchParams {
  step?: string;
  edit?: string;
}

export default async function BusinessSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<BusinessSettingsSearchParams>;
}) {
  const { locale } = await params;
  const de = locale === "de";
  const admin = await requireAdmin();
  const requested = await searchParams;
  // The overview already performs several bounded read batches. Finish it
  // before the small page-level reads to avoid exhausting the serverless pool.
  const overview = await loadConfigurationOverview();
  const [settingsResult, completedSteps] = await Promise.all([
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
    locale,
  });
  const completedStepIds = new Set(completedSteps.map(({ targetId }) => targetId));
  const allStepsRecorded = guide.steps.every(({ id }) => completedStepIds.has(id));
  const hasSetup = Boolean(overview.activeRelease || overview.draftRelease);
  const requestedStep = guide.steps.find((step) => step.id === requested.step);
  const currentStep = requestedStep ?? guide.nextStep;
  const currentIndex = currentStep
    ? guide.steps.findIndex((step) => step.id === currentStep.id)
    : -1;
  const nextStep = currentIndex >= 0 ? guide.steps[currentIndex + 1] : null;
  const nextHref = nextStep?.href ?? "/admin/settings";
  const editing = requested.edit === "1" || currentStep?.state === "complete";
  const shouldRecoverActivation = Boolean(
    !overview.activeRelease && overview.draftRelease && allStepsRecorded,
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <AdminPageHeader
            eyebrow={de ? "Unternehmenseinstellungen" : "Business settings"}
            title={de ? "Richten Sie Ihr Mietwagengeschäft ein" : "Let’s set up your rental business"}
            description={de ? "Schließen Sie einen einfachen Schritt nach dem anderen ab. Wir zeigen Ihnen immer, was als Nächstes kommt, und Sie können später alles ändern." : "Complete one simple step at a time. We will always show you what comes next, and you can change anything later."}
          />
          {hasSetup ? (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> {guide.completed} {de ? "abgeschlossen" : "complete"}
              </span>
              {guide.attentionCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
                  <CircleAlert className="h-3.5 w-3.5" /> {guide.attentionCount} {de ? "benötigen Aufmerksamkeit" : "need attention"}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {overview.activeRelease && overview.draftRelease ? (
        <div className="flex flex-col gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              {de ? "Gespeicherte Änderungen sind noch nicht live" : "Saved changes are not live yet"}
            </p>
            <p className="mt-1 text-sm text-amber-900/80">
              {de
                ? "Neue Fahrzeugpreise und geänderte Mietregeln gelten erst, nachdem Sie sie geprüft und veröffentlicht haben."
                : "New vehicle prices and changed rental rules apply only after you review and publish them."}
            </p>
          </div>
          <Link
            href="/admin/advanced/configuration"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-amber-950 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900"
          >
            {de ? "Prüfen und veröffentlichen" : "Review and publish"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
      {shouldRecoverActivation ? <OwnerSetupActivationRecovery /> : null}
      {!hasSetup ? (
        <StartBusinessSetup />
      ) : currentStep ? (
        <OwnerSettingsWizard guide={guide} currentStepId={currentStep.id} locale={locale}>
          <OwnerSettingsStepContent
            step={currentStep}
            adminId={admin.id}
            nextHref={nextHref}
            editing={editing}
          />
        </OwnerSettingsWizard>
      ) : (
        <BusinessSetupGuide guide={guide} locale={locale} />
      )}
    </main>
  );
}
