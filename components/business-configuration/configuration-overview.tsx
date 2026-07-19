import { ConfigurationHealthSummary } from "./configuration-health-summary"
import { ConfigurationIssueList } from "./configuration-issue-list"
import { ConfigurationEmptyState } from "./configuration-empty-state"
import { DomainStatusCard } from "./domain-status-card"
import { AuditEventList } from "./audit-event-list"
import { ReleaseWorkflowActions } from "./release-workflow-actions"
import { CapabilityGuard } from "./capability-guard"
import { CONFIGURATION_DOMAIN_METADATA } from "@/lib/business-configuration/domain-metadata"
import type { ConfigurationOverview as Overview } from "@/lib/business-configuration/workflow-service"

export function ConfigurationOverview({
  overview,
  actorName,
  capabilities,
}: {
  overview: Overview
  actorName: string
  capabilities: {
    canValidate: boolean
    canActivate: boolean
    canViewAudit: boolean
  }
}) {
  const isEmpty = !overview.activeRelease && !overview.draftRelease
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">More</p>
        <h1 className="text-2xl font-bold tracking-tight">Which saved changes are ready to publish?</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review every changed business area, fix anything required, then publish once for new bookings.</p>
      </div>
      {isEmpty ? <ConfigurationEmptyState /> : null}
      {!isEmpty ? <ConfigurationHealthSummary status={overview.overallStatus} blockers={overview.blockers.length} warnings={overview.warnings.length} draftChanges={overview.changedDomains.length} /> : null}
      {overview.draftRelease ? (
        <ReleaseWorkflowActions
          release={{
            id: overview.draftRelease.id,
            number: overview.draftRelease.releaseNumber,
            name: overview.draftRelease.name,
            revision: overview.draftRelease.revision,
          }}
          actorName={actorName}
          changedDomainLabels={overview.changedDomains.map((domain) => CONFIGURATION_DOMAIN_METADATA[domain].label)}
          blockerCount={overview.blockers.length}
          warningCount={overview.warnings.length}
          fleetCoverage={`${overview.fleetCoverage.dailyRates} of ${overview.fleetCoverage.totalVehicles}`}
          canValidate={capabilities.canValidate}
          canActivate={capabilities.canActivate}
        />
      ) : null}
      <section>
        <div className="mb-3">
          <h2 className="font-semibold">Business areas</h2>
          <p className="text-sm text-muted-foreground">Open an area to finish its changes.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {overview.domainStatuses.map((domain) => (
            <DomainStatusCard key={domain.domain} domain={domain} />
          ))}
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <ConfigurationIssueList title="Must fix before publishing" issues={overview.blockers} emptyMessage="Nothing is blocking publication." />
        <ConfigurationIssueList title="Worth checking" issues={overview.warnings} emptyMessage="Nothing else needs your attention." />
      </div>
      <CapabilityGuard allowed={capabilities.canViewAudit}>
        <details className="rounded-xl border bg-background p-5">
          <summary className="cursor-pointer font-semibold">Advanced activity history</summary>
          <div className="mt-4">
            <AuditEventList events={overview.recentAuditEvents} />
          </div>
        </details>
      </CapabilityGuard>
    </div>
  )
}
