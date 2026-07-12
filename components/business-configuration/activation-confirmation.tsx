"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { activateConfigurationReleaseAction } from "@/app/actions/business-configuration"

const CONFIRMATION = "Activate this configuration for future bookings"

export function ActivationConfirmation({
  release,
  actorName,
  changedDomains,
  warningCount,
  blockerCount,
  fleetCoverage,
}: {
  release: { id: string; number: number; name: string; revision: number }
  actorName: string
  changedDomains: string[]
  warningCount: number
  blockerCount: number
  fleetCoverage: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const canSubmit = blockerCount === 0 && confirmation === CONFIRMATION && (warningCount === 0 || warningsAcknowledged)

  const activate = () => {
    startTransition(async () => {
      setError(null)
      const result = await activateConfigurationReleaseAction({
        releaseId: release.id,
        expectedRevision: release.revision,
        warningsAcknowledged,
        confirmation,
      })
      if ("error" in result) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button disabled={blockerCount > 0}>Review activation</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Activate release {release.number}: {release.name}</DialogTitle>
          <DialogDescription>This affects future bookings only. Existing bookings and historical snapshots will not change.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-2">
            <p><span className="text-muted-foreground">Actor:</span> {actorName}</p>
            <p><span className="text-muted-foreground">Fleet:</span> {fleetCoverage}</p>
            <p><span className="text-muted-foreground">Warnings:</span> {warningCount}</p>
            <p><span className="text-muted-foreground">Blockers:</span> {blockerCount}</p>
          </div>
          <div><p className="font-medium">Changed sections</p><p className="mt-1 text-muted-foreground">{changedDomains.length ? changedDomains.join(", ") : "No section changes detected"}</p></div>
          {warningCount > 0 ? (
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox checked={warningsAcknowledged} onCheckedChange={(value) => setWarningsAcknowledged(value === true)} />
              <span>I reviewed the warnings and understand their effect on future bookings.</span>
            </label>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="activation-confirmation">Type “{CONFIRMATION}”</Label>
            <Input id="activation-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </div>
          {error ? <p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p> : null}
          <Button onClick={activate} disabled={!canSubmit || isPending} className="w-full">
            {isPending ? "Activating…" : CONFIRMATION}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
