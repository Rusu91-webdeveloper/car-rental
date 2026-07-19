import type { LucideIcon } from "lucide-react"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Pencil,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import Link from "@/navigation"
import {
  OWNER_SETTINGS_PHASES,
  type OwnerSettingsGuide,
  type OwnerSettingsStep,
  type OwnerSettingsStepState,
} from "@/lib/admin/owner-settings-guide"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { LinkLoadingIndicator } from "@/components/admin/link-loading-indicator"
import { cn } from "@/lib/utils"

const stateMeta: Record<
  OwnerSettingsStepState,
  { label: string; icon: LucideIcon; className: string }
> = {
  complete: {
    label: "Complete",
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  attention: {
    label: "Needs attention",
    icon: AlertCircle,
    className: "border-red-200 bg-red-50 text-red-700",
  },
  review: {
    label: "Please review",
    icon: ShieldCheck,
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  "in-progress": {
    label: "Started",
    icon: Clock3,
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  "not-started": {
    label: "Not started",
    icon: CircleDashed,
    className: "border-border bg-muted/40 text-muted-foreground",
  },
}

function continueLabel(step: OwnerSettingsStep) {
  if (step.state === "attention") return "Fix and continue"
  if (step.state === "review") return "Review and continue"
  if (step.state === "in-progress") return "Continue"
  return "Start this step"
}

function editHref(href: string) {
  return `${href}${href.includes("?") ? "&" : "?"}edit=1`
}

function PhaseRail({ guide }: { guide: OwnerSettingsGuide }) {
  return (
    <Card className="gap-0 py-0 shadow-none lg:sticky lg:top-6">
      <CardHeader className="border-b px-5 py-5">
        <CardTitle className="text-sm">Your setup</CardTitle>
        <CardDescription>Complete each part in order.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ol>
          {OWNER_SETTINGS_PHASES.map((phase, phaseIndex) => {
            const steps = guide.steps.filter((step) => step.phase === phase.id)
            const completed = steps.filter((step) => step.state === "complete").length
            const active = guide.nextStep?.phase === phase.id
            const phaseComplete = steps.length > 0 && completed === steps.length

            return (
              <li
                key={phase.id}
                className={cn(
                  "flex gap-3 border-b px-5 py-4 last:border-b-0",
                  active && "bg-primary/[0.045]",
                )}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    phaseComplete && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    active && !phaseComplete && "border-primary bg-primary text-primary-foreground",
                  )}
                  aria-hidden="true"
                >
                  {phaseComplete ? <Check className="h-3.5 w-3.5" /> : phaseIndex + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", active && "text-primary")}>{phase.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{completed} of {steps.length} complete</p>
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

function CompletedSettings({ steps }: { steps: OwnerSettingsStep[] }) {
  if (steps.length === 0) return null

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-5 sm:px-6">
        <CardTitle className="text-base">Completed settings</CardTitle>
        <CardDescription>You can change these at any time.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Check className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{step.title}</p>
              <p className="truncate text-xs text-muted-foreground">Complete</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={editHref(step.href)}>
                <Pencil className="h-3.5 w-3.5" /> Edit <LinkLoadingIndicator />
              </Link>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function SetupComplete({ guide }: { guide: OwnerSettingsGuide }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Card className="border-emerald-200 bg-emerald-50/40 text-center">
        <CardHeader>
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <CardTitle className="mt-2 text-2xl">Your business settings are complete</CardTitle>
          <CardDescription className="mx-auto max-w-xl text-sm leading-6">
            Everything required has been set up. You can return here whenever you need to make a change.
          </CardDescription>
        </CardHeader>
      </Card>
      <CompletedSettings steps={guide.steps} />
    </div>
  )
}

export function BusinessSetupGuide({ guide }: { guide: OwnerSettingsGuide }) {
  const currentStep = guide.nextStep
  if (!currentStep) return <SetupComplete guide={guide} />

  const currentIndex = guide.steps.findIndex((step) => step.id === currentStep.id)
  const previousStep = currentIndex > 0 ? guide.steps[currentIndex - 1] : null
  const completedSteps = guide.steps.filter((step) => step.state === "complete")
  const upcomingSteps = guide.steps.slice(currentIndex + 1, currentIndex + 3)
  const meta = stateMeta[currentStep.state]
  const StatusIcon = meta.icon

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="gap-4 border-primary/20 bg-primary/[0.025] py-5 shadow-none">
        <CardContent className="space-y-3 px-5 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Business setup</p>
              <p className="mt-1 text-sm text-muted-foreground">Step {currentIndex + 1} of {guide.total}</p>
            </div>
            <p className="text-2xl font-semibold tracking-tight">{guide.percent}%</p>
          </div>
          <Progress value={guide.percent} aria-label={`${guide.percent}% complete`} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <PhaseRail guide={guide} />

        <div className="space-y-5">
          <Card className="overflow-hidden border-primary/25 shadow-md shadow-primary/5">
            <CardHeader className="border-b bg-muted/25 px-5 pb-5 sm:px-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-primary">Step {currentIndex + 1}</p>
                <Badge variant="outline" className={meta.className}>
                  <StatusIcon className="h-3 w-3" /> {meta.label}
                </Badge>
              </div>
              <CardTitle className="mt-2 text-2xl tracking-tight">{currentStep.title}</CardTitle>
              <CardDescription className="max-w-2xl text-base leading-6">
                {currentStep.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 px-5 sm:px-7">
              <div className="rounded-lg border bg-muted/25 p-4">
                <div className="flex gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Keep it simple</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Only the information needed for this step will be shown. You can come back and edit it later.
                    </p>
                  </div>
                </div>
              </div>
              {currentStep.issueCount > 0 ? (
                <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {currentStep.issueCount} {currentStep.issueCount === 1 ? "item needs" : "items need"} attention
                    </p>
                    <p className="mt-1 text-sm text-red-700">Open this step to see exactly what needs to be corrected.</p>
                  </div>
                </div>
              ) : null}
              {upcomingSteps.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coming next</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {upcomingSteps.map((step) => (
                      <Badge key={step.id} variant="secondary" className="font-normal">{step.title}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
            <CardFooter className="flex-col-reverse gap-3 border-t bg-muted/15 px-5 sm:flex-row sm:justify-between sm:px-7">
              {previousStep ? (
                <Button asChild variant="ghost" className="w-full sm:w-auto">
                  <Link href={previousStep.href}>
                    <ArrowLeft className="h-4 w-4" /> Back <LinkLoadingIndicator />
                  </Link>
                </Button>
              ) : (
                <Button variant="ghost" className="w-full sm:w-auto" disabled>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              )}
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={currentStep.href} aria-current="step">
                  {continueLabel(currentStep)} <ArrowRight className="h-4 w-4" /> <LinkLoadingIndicator />
                </Link>
              </Button>
            </CardFooter>
          </Card>

          <CompletedSettings steps={completedSteps} />
        </div>
      </div>
    </div>
  )
}
