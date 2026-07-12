import { ConfigurationStatusBadge } from "./configuration-status-badge"

export function ConfigurationHealthSummary({
  status,
  blockers,
  warnings,
  draftChanges,
}: {
  status: string
  blockers: number
  warnings: number
  draftChanges: number
}) {
  return (
    <section className="rounded-xl border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Overall configuration health</h2>
          <p className="mt-1 text-sm text-muted-foreground">Action required takes priority, except a completely empty setup is shown as Not configured.</p>
        </div>
        <ConfigurationStatusBadge status={status} />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-red-50 p-3"><p className="text-xl font-semibold text-red-700">{blockers}</p><p className="text-xs text-red-700">Blockers</p></div>
        <div className="rounded-lg bg-amber-50 p-3"><p className="text-xl font-semibold text-amber-700">{warnings}</p><p className="text-xs text-amber-700">Warnings</p></div>
        <div className="rounded-lg bg-blue-50 p-3"><p className="text-xl font-semibold text-blue-700">{draftChanges}</p><p className="text-xs text-blue-700">Draft changes</p></div>
      </div>
    </section>
  )
}
