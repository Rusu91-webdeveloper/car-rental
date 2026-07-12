"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { validateConfigurationReleaseAction, previewConfigurationReleaseAction } from "@/app/actions/business-configuration"
import type { ReleasePreview } from "@/lib/business-configuration/workflow-service"
import { ActivationConfirmation } from "./activation-confirmation"

export function ReleaseWorkflowActions({
  release,
  actorName,
  changedDomainLabels,
  blockerCount,
  warningCount,
  fleetCoverage,
  canValidate,
  canActivate,
}: {
  release: { id: string; number: number; name: string; revision: number }
  actorName: string
  changedDomainLabels: string[]
  blockerCount: number
  warningCount: number
  fleetCoverage: string
  canValidate: boolean
  canActivate: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [preview, setPreview] = useState<ReleasePreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const validate = () => startTransition(async () => {
    setMessage(null)
    const result = await validateConfigurationReleaseAction({ releaseId: release.id })
    setMessage("error" in result ? result.error : "Validation finished. Review the refreshed health report.")
    if (!("error" in result)) router.refresh()
  })
  const loadPreview = () => startTransition(async () => {
    setMessage(null)
    const result = await previewConfigurationReleaseAction({ releaseId: release.id })
    if (!("error" in result)) setPreview(result.preview)
    else setMessage(result.error)
  })

  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="font-semibold">Review this draft</h2>
      <p className="mt-1 text-sm text-muted-foreground">Validation and preview never activate settings.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canValidate ? <Button variant="outline" onClick={validate} disabled={isPending}>Validate draft</Button> : null}
        <Button variant="outline" onClick={loadPreview} disabled={isPending}>Preview changes</Button>
        {canActivate ? (
          <ActivationConfirmation
            release={release}
            actorName={actorName}
            changedDomains={changedDomainLabels}
            blockerCount={blockerCount}
            warningCount={warningCount}
            fleetCoverage={fleetCoverage}
          />
        ) : null}
      </div>
      {message ? <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{message}</p> : null}
      {preview ? (
        <div className="mt-5 space-y-4 rounded-lg border p-4">
          <div><p className="font-medium">Customer-facing impact</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{preview.changedDomains.map((domain) => <li key={domain.domain}>{domain.label}: {domain.impact}</li>)}</ul></div>
          <p className="text-sm">Fleet coverage: {preview.fleetCoverage.dailyRates} of {preview.fleetCoverage.totalVehicles} vehicles have daily rates.</p>
          {preview.pricingExamples.length ? <div><p className="font-medium">Read-only pricing examples</p><p className="mt-1 text-sm text-muted-foreground">{preview.pricingExamples.map((example) => `${example.days} days: ${new Intl.NumberFormat("en", { style: "currency", currency: example.currency }).format(example.total / 100)}`).join(" · ")}</p></div> : null}
          <p className="text-sm text-muted-foreground">{preview.blockers.length} blocker(s) · {preview.warnings.length} warning(s)</p>
        </div>
      ) : null}
    </section>
  )
}
