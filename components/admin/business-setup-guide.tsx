import type { LucideIcon } from "lucide-react"
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Pencil,
  ShieldAlert,
  Sparkles,
} from "lucide-react"
import Link from "@/navigation"
import type { ConfigurationHealthFinding } from "@/lib/business-configuration/health"
import {
  OWNER_SETTINGS_PHASES,
  type OwnerSettingsGuide,
  type OwnerSettingsStep,
  type OwnerSettingsStepState,
} from "@/lib/admin/owner-settings-guide"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

const stateMeta: Record<
  OwnerSettingsStepState,
  { label: string; icon: LucideIcon; badge: string; marker: string }
> = {
  complete: {
    label: "Complete",
    icon: Check,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    marker: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  attention: {
    label: "Needs attention",
    icon: AlertCircle,
    badge: "border-red-200 bg-red-50 text-red-700",
    marker: "border-red-200 bg-red-50 text-red-700",
  },
  review: {
    label: "Review",
    icon: ShieldAlert,
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    marker: "border-amber-200 bg-amber-50 text-amber-700",
  },
  "in-progress": {
    label: "Draft saved",
    icon: Clock3,
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    marker: "border-blue-200 bg-blue-50 text-blue-700",
  },
  "not-started": {
    label: "Not started",
    icon: CircleDashed,
    badge: "border-slate-200 bg-slate-50 text-slate-600",
    marker: "border-slate-200 bg-white text-slate-500",
  },
}

function actionLabelFor(step: OwnerSettingsStep, current: boolean) {
  if (step.state === "complete") return "Edit"
  if (current) return step.state === "attention" ? "Fix this step" : "Continue"
  if (step.state === "attention" || step.state === "review") return "Review"
  return "View"
}

function StepRow({
  step,
  number,
  current,
}: {
  step: OwnerSettingsStep
  number: number
  current: boolean
}) {
  const meta = stateMeta[step.state]
  const StatusIcon = meta.icon
  const actionLabel = actionLabelFor(step, current)

  return (
    <li
      className={cn(
        "relative grid gap-3 border-t px-4 py-4 first:border-t-0 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-5",
        current && "bg-primary/[0.045] py-5 sm:py-6",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          current && "h-11 w-11 border-primary/25 bg-background text-primary shadow-sm",
          !current && meta.marker,
        )}
        aria-hidden="true"
      >
        {step.state === "complete" ? <Check className="h-4 w-4" /> : number}
      </div>
      <div className="min-w-0">
        {current ? <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">Do this next</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn("font-medium tracking-tight", current && "text-lg font-semibold")}>{step.title}</h3>
          <Badge variant="outline" className={meta.badge}>
            <StatusIcon className="h-3 w-3" /> {meta.label}
          </Badge>
          {step.issueCount > 0 ? (
            <span className="text-xs font-medium text-red-700">
              {step.issueCount} {step.issueCount === 1 ? "item" : "items"} to check
            </span>
          ) : null}
        </div>
        <p className={cn("mt-1 text-sm text-muted-foreground", current && "max-w-2xl leading-6")}>{step.description}</p>
        {current ? <p className="mt-2 text-xs text-muted-foreground">Your progress is saved when you complete the form.</p> : null}
      </div>
      <Button
        asChild
        variant={current ? "default" : step.state === "complete" ? "ghost" : "outline"}
        size={current ? "default" : "sm"}
        className="w-full sm:w-auto"
      >
        <Link href={step.href} aria-current={current ? "step" : undefined}>
          {step.state === "complete" ? <Pencil className="h-3.5 w-3.5" /> : null}
          {actionLabel}
          {step.state !== "complete" ? <ArrowRight className="h-3.5 w-3.5" /> : null}
        </Link>
      </Button>
    </li>
  )
}

function friendlyFindingMessage(finding: ConfigurationHealthFinding) {
  if (finding.message.includes("Invalid enum value") && finding.message.includes("DRAFT")) {
    return "A required item is still saved as a draft. Open its checklist step and finish publishing it."
  }
  return finding.message
}

export function BusinessSetupGuide({
  guide,
  blockers,
  warnings,
  isLive,
}: {
  guide: OwnerSettingsGuide
  blockers: ConfigurationHealthFinding[]
  warnings: ConfigurationHealthFinding[]
  isLive: boolean
}) {
  const findings = blockers.length > 0 ? blockers : warnings
  const complete = guide.completed === guide.total
  const nextPhaseIndex = guide.nextStep
    ? OWNER_SETTINGS_PHASES.findIndex((phase) => phase.id === guide.nextStep?.phase)
    : OWNER_SETTINGS_PHASES.length - 1

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
      <section className="space-y-5" aria-labelledby="setup-steps-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Guided setup</p>
            <h2 id="setup-steps-title" className="mt-1 text-xl font-semibold tracking-tight">
              One clear step at a time
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">The highlighted step is always the one to do next.</p>
        </div>

        {OWNER_SETTINGS_PHASES.map((phase, phaseIndex) => {
          const phaseSteps = guide.steps.filter((step) => step.phase === phase.id)
          const firstStepIndex = guide.steps.findIndex((step) => step.id === phaseSteps[0]?.id)
          const completedInPhase = phaseSteps.filter((step) => step.state === "complete").length
          const isCurrentPhase = guide.nextStep?.phase === phase.id
          const phaseComplete = phaseSteps.length > 0 && completedInPhase === phaseSteps.length

          return (
            <section
              key={phase.id}
              className={cn(
                "overflow-hidden rounded-2xl border bg-background shadow-sm",
                isCurrentPhase && "border-primary/30 ring-1 ring-primary/10",
              )}
              aria-labelledby={`phase-${phase.id}`}
            >
              <header className={cn("flex items-start gap-3 bg-muted/35 px-4 py-4 sm:px-5", isCurrentPhase && "bg-primary/[0.035]") }>
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-sm font-semibold shadow-sm",
                    phaseComplete && "text-emerald-700",
                    isCurrentPhase && "text-primary",
                  )}
                >
                  {phaseComplete ? <Check className="h-4 w-4" /> : phaseIndex + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 id={`phase-${phase.id}`} className="font-semibold">{phase.label}</h3>
                    {isCurrentPhase ? (
                      <Badge variant="outline" className="border-primary/25 bg-background text-primary">Current phase</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{phase.description}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {completedInPhase}/{phaseSteps.length}
                </span>
              </header>
              <ol start={firstStepIndex + 1}>
                {phaseSteps.map((step, stepIndex) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    number={firstStepIndex + stepIndex + 1}
                    current={guide.nextStep?.id === step.id}
                  />
                ))}
              </ol>
            </section>
          )
        })}
      </section>

      <aside className="space-y-4 xl:sticky xl:top-6">
        <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="bg-gradient-to-br from-primary/[0.1] via-primary/[0.035] to-transparent p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overall progress</p>
                <p className="mt-1 text-3xl font-bold tracking-tight">{guide.percent}%</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-background text-primary shadow-sm">
                {complete ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <Sparkles className="h-6 w-6" />}
              </span>
            </div>
            <Progress value={guide.percent} className="mt-4 bg-primary/15" aria-label={`${guide.percent}% complete`} />
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{guide.completed} of {guide.total} steps</span>
              <span>Phase {nextPhaseIndex + 1} of {OWNER_SETTINGS_PHASES.length}</span>
            </div>
          </div>
          <div className="border-t p-5">
            {guide.nextStep ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Next step</p>
                <p className="mt-2 font-semibold">{guide.nextStep.title}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Look for the highlighted card in the current phase.</p>
              </>
            ) : (
              <div className="text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-2 font-semibold">Everything is ready</p>
                <p className="mt-1 text-sm text-muted-foreground">Return anytime to edit a completed step.</p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-background p-5">
          <div className="flex items-start gap-3">
            {blockers.length > 0 ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            )}
            <div>
              <h2 className="font-semibold">{blockers.length > 0 ? "Before you publish" : "Setup check"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {blockers.length > 0
                  ? `${blockers.length} required ${blockers.length === 1 ? "item needs" : "items need"} attention.`
                  : warnings.length > 0
                    ? "No blockers. A few items are worth reviewing."
                    : isLive
                      ? "Everything is complete and live."
                      : "No blocking issues found."
                }
              </p>
            </div>
          </div>
          {findings.length > 0 ? (
            <ul className="mt-4 space-y-3 border-t pt-4">
              {findings.slice(0, 2).map((finding, index) => (
                <li key={`${finding.domain}-${finding.code}-${finding.affectedResource ?? index}`} className="text-sm leading-5">
                  {friendlyFindingMessage(finding)}
                </li>
              ))}
            </ul>
          ) : null}
          {findings.length > 2 ? (
            <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
              {findings.length - 2} more {findings.length - 2 === 1 ? "item" : "items"} will appear in the final review.
            </p>
          ) : null}
        </section>
      </aside>
    </div>
  )
}
