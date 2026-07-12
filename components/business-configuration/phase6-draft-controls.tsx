"use client"
import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import {
  createPhase6DraftAction,
  validatePhase6DraftsAction,
  attachPhase6DraftsAction,
  discardPhase6DraftAction,
} from "@/app/actions/phase6-configuration"
import type { Phase6AdminPageData } from "@/lib/phase6-admin/types"

export function Phase6DraftControls({
  data,
  domain,
  hasDraft,
  canCreate,
  canValidate,
  canAttach,
}: {
  data: Phase6AdminPageData
  domain: "INSURANCE" | "CUSTOMER_DRIVER_REQUIREMENTS" | "BOOKING_WORKFLOW"
  hasDraft: boolean
  canCreate: boolean
  canValidate: boolean
  canAttach: boolean
}) {
  const router = useRouter()
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const draft =
    domain === "INSURANCE"
      ? data.draftInsurance
      : domain === "CUSTOMER_DRIVER_REQUIREMENTS"
        ? data.draftCustomerDriver
        : data.draftWorkflow
  const run = (task: () => Promise<{ success?: true; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await task()
      setMessage(result.error ?? success)
      if (!result.error) router.refresh()
    })
  return (
    <section className="rounded-xl border bg-background p-4">
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
                  "Draft created.",
                )
              }
              disabled={pending}
            >
              Create {data.activeRelease ? "from live" : "initial draft"}
            </Button>
          </>
        ) : null}
        {canValidate && data.draftInsurance && data.draftCustomerDriver && data.draftWorkflow ? (
          <Button
            variant="outline"
            onClick={() => run(() => validatePhase6DraftsAction(), "Phase 6 validation completed.")}
            disabled={pending}
          >
            Validate Phase 6 drafts
          </Button>
        ) : null}
        {canAttach &&
        data.draftInsurance &&
        data.draftCustomerDriver &&
        data.draftWorkflow &&
        !(data.attached.insurance && data.attached.customerDriver && data.attached.workflow) ? (
          <Button
            variant="outline"
            onClick={() =>
              run(
                () =>
                  attachPhase6DraftsAction({
                    expectedReleaseRevision: data.draftRelease?.revision,
                  }),
                "Drafts attached to release.",
              )
            }
            disabled={pending}
          >
            Attach exact drafts to release
          </Button>
        ) : null}
        {canCreate && draft ? (
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Discard this draft? Live configuration and historical bookings will not change."))
                return
              run(
                () =>
                  discardPhase6DraftAction({
                    domain,
                    versionId: draft.id,
                    expectedRevision: draft.revision,
                  }),
                "Draft discarded.",
              )
            }}
          >
            Discard draft
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Saving and validation never activate settings. Activation remains on the Overview release workflow.
      </p>
      {message ? <p className="mt-3 rounded bg-muted p-2 text-sm">{message}</p> : null}
    </section>
  )
}
