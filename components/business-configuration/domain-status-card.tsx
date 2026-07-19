import Link from "@/navigation"
import { ConfigurationStatusBadge } from "./configuration-status-badge"
import type { DomainStatusView } from "@/lib/business-configuration/workflow-service"

export function DomainStatusCard({ domain }: { domain: DomainStatusView }) {
  return (
    <Link href={domain.route} className="block rounded-xl border bg-background p-4 transition hover:border-primary/40 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{domain.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{domain.draftVersion ? "Has unpublished changes" : domain.liveVersion ? "No unpublished changes" : "Not set up"}</p>
        </div>
        <ConfigurationStatusBadge status={domain.status} />
      </div>
      <div className="mt-4 flex gap-3 text-xs text-muted-foreground">
        <span>{domain.blockerCount} must fix</span>
        <span>{domain.warningCount} worth checking</span>
      </div>
    </Link>
  )
}
