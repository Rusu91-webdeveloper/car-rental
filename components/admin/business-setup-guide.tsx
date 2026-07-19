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
import type {
  OwnerSettingsGuide,
  OwnerSettingsStep,
  OwnerSettingsStepState,
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

function StepRow({ step, number, current }: { step: OwnerSettingsStep; number: number; current: boolean }) {
  const meta = stateMeta[step.state]
  const StatusIcon = meta.icon
  const actionLabel =
    step.state === "complete" ? "Edit" : step.state === "attention" ? "Fix now" : current ? "Continue" : "Open"

  return (
    <li
      className={cn(
        "relative grid gap-4 rounded-2xl border bg-background p-4 transition sm:grid-cols-[auto_1fr_auto] sm:p-5",
        current && "border-primary/35 bg-primary/[0.025] shadow-sm",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          meta.marker,
        )}
        aria-hidden="true"
      >
        {step.state === "complete" ? <Check className="h-5 w-5" /> : number}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold tracking-tight">{step.title}</h2>
          <Badge variant="outline" className={meta.badge}>
            <StatusIcon className="h-3 w-3" /> {meta.label}
          </Badge>
          {step.issueCount > 0 ? (
            <span className="text-xs font-medium text-red-700">
              {step.issueCount} {step.issueCount === 1 ? "item" : "items"} to check
            </span>
          ) : null}
        </div>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{step.description}</p>
        {step.links ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {step.links.map((link) => (
              <Link key={link.href} href={link.href} className="text-xs font-medium text-primary hover:underline">
                {link.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <Button asChild variant={current || step.state === "attention" ? "default" : "outline"} size="sm" className="w-full sm:w-auto">
        <Link href={step.href}>
          {step.state === "complete" ? <Pencil className="h-3.5 w-3.5" /> : null}
          {actionLabel}
          {step.state !== "complete" ? <ArrowRight className="h-3.5 w-3.5" /> : null}
        </Link>
      </Button>
    </li>
  )
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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <section className="space-y-4" aria-labelledby="setup-steps-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Guided setup</p>
            <h2 id="setup-steps-title" className="mt-1 text-xl font-semibold tracking-tight">
              Follow these steps in order
            </h2>
          </div>
          <p className="hidden text-sm text-muted-foreground sm:block">You can edit any completed step anytime.</p>
        </div>
        <ol className="space-y-3">
          {guide.steps.map((step, index) => (
            <StepRow key={step.id} step={step} number={index + 1} current={guide.nextStep?.id === step.id} />
          ))}
        </ol>
      </section>

      <aside className="space-y-4 xl:sticky xl:top-6">
        <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="bg-gradient-to-br from-primary/[0.09] via-primary/[0.035] to-transparent p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Setup progress</p>
                <p className="mt-1 text-3xl font-bold tracking-tight">{guide.percent}%</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-background text-primary shadow-sm">
                {complete ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <Sparkles className="h-6 w-6" />}
              </span>
            </div>
            <Progress value={guide.percent} className="mt-4 bg-primary/15" aria-label={`${guide.percent}% complete`} />
            <p className="mt-3 text-sm text-muted-foreground">
              {guide.completed} of {guide.total} steps complete
            </p>
          </div>
          <div className="border-t p-5">
            {guide.nextStep ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Up next</p>
                <p className="mt-2 font-semibold">{guide.nextStep.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{guide.nextStep.description}</p>
                <Button asChild className="mt-4 w-full">
                  <Link href={guide.nextStep.href}>
                    {guide.nextStep.state === "attention" ? "Fix this step" : "Continue setup"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            ) : (
              <div className="text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-2 font-semibold">Everything is ready</p>
                <p className="mt-1 text-sm text-muted-foreground">You can return here anytime to make changes.</p>
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
              <h2 className="font-semibold">{blockers.length > 0 ? "What needs attention" : "Configuration check"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {blockers.length > 0
                  ? `${blockers.length} required ${blockers.length === 1 ? "item is" : "items are"} blocking publication.`
                  : warnings.length > 0
                    ? "No blockers. A few items are worth reviewing."
                    : isLive
                      ? "Everything is accepted and currently live."
                      : "No blocking issues found in your current setup."}
              </p>
            </div>
          </div>
          {findings.length > 0 ? (
            <ul className="mt-4 space-y-3 border-t pt-4">
              {findings.slice(0, 3).map((finding, index) => (
                <li key={`${finding.domain}-${finding.code}-${finding.affectedResource ?? index}`} className="text-sm">
                  <p className="leading-5">{finding.message}</p>
                  {finding.adminRoute ? (
                    <Link href={finding.adminRoute} className="mt-1 inline-flex items-center text-xs font-medium text-primary hover:underline">
                      Fix this <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {findings.length > 3 ? (
            <Button asChild variant="outline" size="sm" className="mt-4 w-full">
              <Link href="/admin/advanced/configuration">View all {findings.length} items</Link>
            </Button>
          ) : null}
        </section>
      </aside>
    </div>
  )
}
