"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { attachPricingDraftToReleaseAction, createPricingDraftAction, discardPricingDraftAction, validatePricingDraftAction } from "@/app/actions/pricing-configuration"
import type { PricingAdminPageData } from "@/lib/pricing-admin/types"

export function PricingDraftControls({ data, canManage, canValidate }: { data: PricingAdminPageData; canManage: boolean; canValidate: boolean }) {
  const router = useRouter()
  const summary = "Pricing and billing update"
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const run = (task: () => Promise<{ success?: true; error?: string }>, success: string) =>
    startTransition(async () => {
      setMessage(undefined)
      const result = await task()
      setMessage(result.error ?? success)
      if (!result.error) router.refresh()
    })
  if (!data.draftPricing || !data.draftFleet)
    return canManage ? (
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Ready to change your prices?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Start with the prices customers use today. Your edits stay private until an owner publishes them.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.liveFleet ? (
            <Button
              onClick={() =>
                run(
                  () =>
                    createPricingDraftAction({
                      source: "LIVE",
                      changeSummary: summary,
                    }),
                  "You can now edit your prices.",
                )
              }
              disabled={pending}
            >
              Edit current prices
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() =>
              run(
                () =>
                  createPricingDraftAction({
                    source: "LEGACY",
                    changeSummary: summary,
                  }),
                "You can now edit your prices.",
              )
            }
            disabled={pending}
          >
            Set up prices
          </Button>
        </div>
        {message ? <p className="mt-3 text-sm">{message}</p> : null}
      </section>
    ) : (
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Prices are view only</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ask an owner or pricing manager to make changes.</p>
      </section>
    )

  return (
    <section className="rounded-xl border bg-background p-5">
      <div>
        <h2 className="font-semibold">Your price changes are not published yet</h2>
        <p className="text-sm text-muted-foreground">Keep editing safely; customers continue to see the current prices.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {canValidate ? (
          <Button variant="outline" onClick={() => run(() => validatePricingDraftAction(), "All prices look ready.")} disabled={pending}>
            Check my prices
          </Button>
        ) : null}
        {canManage && !(data.pricingDraftAttached && data.fleetDraftAttached) ? (
          <Button
            variant="outline"
            onClick={() =>
              run(
                () =>
                  attachPricingDraftToReleaseAction({
                    expectedReleaseRevision: data.draftRelease?.revision,
                  }),
                "Prices added to the next update.",
              )
            }
            disabled={pending}
          >
            Add to next update
          </Button>
        ) : null}
        {canManage ? (
          <Button
            variant="destructive"
            onClick={() => {
              if (window.confirm("Undo all unpublished price changes? This cannot be undone."))
                run(
                  () =>
                    discardPricingDraftAction({
                      confirmation: "Discard pricing draft",
                    }),
                  "Unpublished price changes removed.",
                )
            }}
            disabled={pending}
          >
            Undo changes
          </Button>
        ) : null}
      </div>
      <details className="mt-3 text-sm text-muted-foreground">
        <summary className="cursor-pointer">How publishing works</summary>
        <p className="mt-2">Save and check prices here, then add them to the next update. An owner can publish the update from More → Publish changes.</p>
      </details>
      {message ? <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{message}</p> : null}
    </section>
  )
}
