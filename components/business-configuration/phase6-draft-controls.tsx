"use client"
import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { createPhase6DraftAction, validatePhase6DraftsAction, attachPhase6DraftsAction, discardPhase6DraftAction } from "@/app/actions/phase6-configuration"
import type { Phase6AdminPageData } from "@/lib/phase6-admin/types"

export function Phase6DraftControls({ data, domain, hasDraft, canCreate, canValidate, canAttach }: { data: Phase6AdminPageData; domain: "INSURANCE" | "CUSTOMER_DRIVER_REQUIREMENTS" | "BOOKING_WORKFLOW"; hasDraft: boolean; canCreate: boolean; canValidate: boolean; canAttach: boolean }) {
  const router = useRouter()
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const draft = domain === "INSURANCE" ? data.draftInsurance : domain === "CUSTOMER_DRIVER_REQUIREMENTS" ? data.draftCustomerDriver : data.draftWorkflow
  const run = (task: () => Promise<{ success?: true; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await task()
      setMessage(result.error ?? success)
      if (!result.error) router.refresh()
    })
  return (
    <section className="rounded-xl border bg-background p-4">
      <div className="mb-3">
        <h2 className="font-semibold">{hasDraft ? "Your changes are not published yet" : "Ready to make changes?"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{hasDraft ? "You can keep editing safely. Customers continue to see the current settings." : "Start with the settings customers use today."}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!hasDraft && canCreate ? (
          <>
            <Button
              onClick={() =>
                run(
                  () =>
                    createPhase6DraftAction({
                      domain,
                      source: data.activeRelease ? "LIVE" : "DEFAULT",
                      changeSummary: "Phase 6 configuration draft",
                    }),
                  "You can now edit these settings.",
                )
              }
              disabled={pending}
            >
              Edit these settings
            </Button>
          </>
        ) : null}
        {canValidate && data.draftInsurance && data.draftCustomerDriver && data.draftWorkflow ? (
          <Button variant="outline" onClick={() => run(() => validatePhase6DraftsAction(), "All changes look ready.")} disabled={pending}>
            Check my changes
          </Button>
        ) : null}
        {canAttach && data.draftInsurance && data.draftCustomerDriver && data.draftWorkflow && !(data.attached.insurance && data.attached.customerDriver && data.attached.workflow) ? (
          <Button
            variant="outline"
            onClick={() =>
              run(
                () =>
                  attachPhase6DraftsAction({
                    expectedReleaseRevision: data.draftRelease?.revision,
                  }),
                "Changes added to the next update.",
              )
            }
            disabled={pending}
          >
            Add to next update
          </Button>
        ) : null}
        {canCreate && draft ? (
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Undo all unpublished changes on this page? Customers will continue to see the current settings.")) return
              run(
                () =>
                  discardPhase6DraftAction({
                    domain,
                    versionId: draft.id,
                    expectedRevision: draft.revision,
                  }),
                "Unpublished changes removed.",
              )
            }}
          >
            Undo changes
          </Button>
        ) : null}
      </div>
      {hasDraft ? (
        <details className="mt-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer">How publishing works</summary>
          <p className="mt-2">Save here, check the changes, then add them to the next update. An owner can publish the update from More → Publish changes.</p>
        </details>
      ) : null}
      {message ? <p className="mt-3 rounded bg-muted p-2 text-sm">{message}</p> : null}
    </section>
  )
}
