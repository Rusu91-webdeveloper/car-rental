"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { attachPricingDraftToReleaseAction, createPricingDraftAction, discardPricingDraftAction, validatePricingDraftAction } from "@/app/actions/pricing-configuration"
import type { PricingAdminPageData } from "@/lib/pricing-admin/types"

export function PricingDraftControls({ data, canManage, canValidate }: { data: PricingAdminPageData; canManage: boolean; canValidate: boolean }) {
  const router = useRouter()
  const [summary, setSummary] = useState("Pricing and billing update")
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const run = (task: () => Promise<{ success?: true; error?: string }>, success: string) => startTransition(async () => {
    setMessage(undefined)
    const result = await task()
    setMessage(result.error ?? success)
    if (!result.error) router.refresh()
  })
  if (!data.draftPricing || !data.draftFleet) return canManage ? (
    <section className="rounded-xl border bg-background p-5"><h2 className="font-semibold">Create a pricing draft</h2><p className="mt-1 text-sm text-muted-foreground">Nothing becomes live until it is attached, validated, reviewed, and explicitly activated.</p><Input className="mt-4 max-w-xl" value={summary} onChange={(event) => setSummary(event.target.value)} aria-label="Change summary" /><div className="mt-3 flex flex-wrap gap-2">{data.liveFleet ? <Button onClick={() => run(() => createPricingDraftAction({ source: "LIVE", changeSummary: summary }), "Draft copied from live pricing.")} disabled={pending}>Create from live</Button> : null}<Button variant="outline" onClick={() => run(() => createPricingDraftAction({ source: "LEGACY", changeSummary: summary }), "Draft copied from legacy daily prices.")} disabled={pending}>Copy from Car.price</Button></div>{message ? <p className="mt-3 text-sm">{message}</p> : null}</section>
  ) : <section className="rounded-xl border bg-background p-5"><h2 className="font-semibold">No pricing draft</h2><p className="mt-1 text-sm text-muted-foreground">You have read-only access. Ask a pricing manager to create a draft.</p></section>

  return <section className="rounded-xl border bg-background p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Draft workflow</h2><p className="text-sm text-muted-foreground">Saving never activates pricing.</p></div><p className="text-sm">Release: {data.pricingDraftAttached && data.fleetDraftAttached ? "Attached" : "Not attached"}</p></div><div className="mt-4 flex flex-wrap gap-2">{canValidate ? <Button variant="outline" onClick={() => run(() => validatePricingDraftAction(), "Pricing validation completed.")} disabled={pending}>Validate pricing</Button> : null}{canManage && !(data.pricingDraftAttached && data.fleetDraftAttached) ? <Button variant="outline" onClick={() => run(() => attachPricingDraftToReleaseAction({ expectedReleaseRevision: data.draftRelease?.revision }), "Drafts attached to the release.")} disabled={pending}>Attach to release</Button> : null}{canManage ? <Button variant="destructive" onClick={() => { if (window.confirm("Discard both editable pricing drafts? This cannot be undone.")) run(() => discardPricingDraftAction({ confirmation: "Discard pricing draft" }), "Pricing drafts discarded.") }} disabled={pending}>Discard draft</Button> : null}</div>{message ? <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{message}</p> : null}</section>
}
