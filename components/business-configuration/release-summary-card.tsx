import { ConfigurationStatusBadge } from "./configuration-status-badge"
import type { ReleaseAggregate } from "@/lib/business-configuration/repositories"

export function ReleaseSummaryCard({
  title,
  release,
  emptyMessage,
}: {
  title: string
  release: ReleaseAggregate | null
  emptyMessage: string
}) {
  return (
    <section className="rounded-xl border bg-background p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {release ? <ConfigurationStatusBadge status={release.validationStatus} /> : null}
      </div>
      {!release ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <p className="font-medium">Release {release.releaseNumber}: {release.name}</p>
          <p className="text-muted-foreground">{release.changeSummary}</p>
          <p className="text-xs text-muted-foreground">
            {release.activatedAt
              ? `Activated ${new Date(release.activatedAt).toLocaleString()} by ${release.activatedByName}`
              : `Last edited ${new Date(release.updatedAt).toLocaleString()} by ${release.updatedByName}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Fleet rates: version {release.fleetRateSet.versionNumber} · {release.fleetRateSet.rates.length} vehicle rate(s)
          </p>
        </div>
      )}
    </section>
  )
}
