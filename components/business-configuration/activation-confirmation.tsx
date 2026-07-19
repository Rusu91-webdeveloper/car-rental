"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { activateConfigurationReleaseAction } from "@/app/actions/business-configuration"

const CONFIRMATION = "Activate this configuration for future bookings"

export function ActivationConfirmation({ release, actorName, changedDomains, warningCount, blockerCount, fleetCoverage }: { release: { id: string; number: number; name: string; revision: number }; actorName: string; changedDomains: string[]; warningCount: number; blockerCount: number; fleetCoverage: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const canSubmit = blockerCount === 0 && (warningCount === 0 || warningsAcknowledged)

  const publish = () =>
    startTransition(async () => {
      setError(null)
      const result = await activateConfigurationReleaseAction({
        releaseId: release.id,
        expectedRevision: release.revision,
        warningsAcknowledged,
        confirmation: CONFIRMATION,
      })
      if ("error" in result) return setError(result.error)
      setOpen(false)
      router.refresh()
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={blockerCount > 0}>Publish changes</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publish these business changes?</DialogTitle>
          <DialogDescription>New bookings will use them immediately. Existing bookings will not change.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Published by:</span> {actorName}
            </p>
            <p>
              <span className="text-muted-foreground">Cars with daily prices:</span> {fleetCoverage}
            </p>
            <p>
              <span className="text-muted-foreground">Worth checking:</span> {warningCount}
            </p>
            <p>
              <span className="text-muted-foreground">Must fix:</span> {blockerCount}
            </p>
          </div>
          <div>
            <p className="font-medium">Changed areas</p>
            <p className="mt-1 text-muted-foreground">{changedDomains.length ? changedDomains.join(", ") : "No changes found"}</p>
          </div>
          {warningCount > 0 ? (
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox checked={warningsAcknowledged} onCheckedChange={(value) => setWarningsAcknowledged(value === true)} />
              <span>I reviewed the items worth checking.</span>
            </label>
          ) : null}
          {error ? <p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p> : null}
          <Button onClick={publish} disabled={!canSubmit || isPending} className="w-full">
            {isPending ? "Publishing…" : "Publish for new bookings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
