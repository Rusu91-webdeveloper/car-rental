import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ShieldCheck,
} from "lucide-react"
import Link from "@/navigation"
import { LinkLoadingIndicator } from "@/components/admin/link-loading-indicator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  OWNER_SETTINGS_PHASES,
  type OwnerSettingsGuide,
  type OwnerSettingsStepState,
} from "@/lib/admin/owner-settings-guide"
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

interface OwnerSettingsWizardProps {
  guide: OwnerSettingsGuide
  currentStepId: string
  children: ReactNode
}

export function OwnerSettingsWizard({ guide, currentStepId, children }: OwnerSettingsWizardProps) {
  const currentIndex = guide.steps.findIndex((step) => step.id === currentStepId)
  const currentStep = guide.steps[currentIndex]
  if (!currentStep) return null

  const previousStep = currentIndex > 0 ? guide.steps[currentIndex - 1] : null
  const meta = stateMeta[currentStep.state]
  const StatusIcon = meta.icon

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Card className="gap-4 border-primary/20 bg-primary/[0.025] py-5 shadow-none">
        <CardContent className="space-y-3 px-5 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Business setup</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Step {currentIndex + 1} of {guide.total}
              </p>
            </div>
            <p className="text-2xl font-semibold tracking-tight">{guide.percent}%</p>
          </div>
          <Progress value={guide.percent} aria-label={`${guide.percent}% complete`} />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <Card className="gap-0 overflow-hidden py-0 shadow-none lg:sticky lg:top-6">
          <CardHeader className="border-b px-5 py-5">
            <CardTitle className="text-base">Your settings</CardTitle>
            <CardDescription>Select any step to review or change it.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <nav aria-label="Business setup steps">
              {OWNER_SETTINGS_PHASES.map((phase) => {
                const phaseSteps = guide.steps.filter((step) => step.phase === phase.id)
                return (
                  <div key={phase.id} className="border-b last:border-b-0">
                    <p className="bg-muted/35 px-5 py-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      {phase.label}
                    </p>
                    <ol>
                      {phaseSteps.map((step) => {
                        const stepIndex = guide.steps.findIndex((item) => item.id === step.id)
                        const active = step.id === currentStep.id
                        const StepIcon = stateMeta[step.state].icon
                        return (
                          <li key={step.id}>
                            <Link
                              href={step.href}
                              aria-current={active ? "step" : undefined}
                              className={cn(
                                "group flex items-center gap-3 border-t px-4 py-3 transition-colors first:border-t-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                active && "bg-primary/[0.07] hover:bg-primary/[0.07]",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                                  active && "border-primary bg-primary text-primary-foreground",
                                  !active && step.state === "complete" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                  !active && step.state === "attention" && "border-red-200 bg-red-50 text-red-700",
                                )}
                                aria-hidden="true"
                              >
                                {step.state === "complete" ? <Check className="h-3.5 w-3.5" /> : stepIndex + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={cn("block truncate text-sm font-medium", active && "text-primary")}>{step.title}</span>
                                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                  <StepIcon className="h-3 w-3" /> {stateMeta[step.state].label}
                                </span>
                              </span>
                              <LinkLoadingIndicator />
                            </Link>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                )
              })}
            </nav>
          </CardContent>
        </Card>

        <section className="min-w-0 space-y-5" aria-labelledby="settings-step-title">
          <Card className="gap-0 overflow-hidden border-primary/25 py-0 shadow-sm">
            <CardHeader className="bg-muted/25 px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-primary">Step {currentIndex + 1}</p>
                <Badge variant="outline" className={meta.className}>
                  <StatusIcon className="h-3 w-3" /> {meta.label}
                </Badge>
              </div>
              <CardTitle id="settings-step-title" className="mt-2 text-2xl tracking-tight">
                {currentStep.title}
              </CardTitle>
              <CardDescription className="max-w-2xl text-base leading-6">
                {currentStep.description}
              </CardDescription>
            </CardHeader>
          </Card>

          {previousStep ? (
            <Button asChild variant="ghost" className="-ml-2 w-fit">
              <Link href={previousStep.href}>
                <ArrowLeft className="h-4 w-4" /> Back to {previousStep.title} <LinkLoadingIndicator />
              </Link>
            </Button>
          ) : null}

          <div className="space-y-5">{children}</div>
        </section>
      </div>
    </div>
  )
}
