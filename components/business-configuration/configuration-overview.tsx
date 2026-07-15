import { ConfigurationHealthSummary } from "./configuration-health-summary"
import { ConfigurationIssueList } from "./configuration-issue-list"
import { ConfigurationEmptyState } from "./configuration-empty-state"
import { DomainStatusCard } from "./domain-status-card"
import { ReleaseSummaryCard } from "./release-summary-card"
import { DraftLiveComparison } from "./draft-live-comparison"
import { FleetCoverageSummary } from "./fleet-coverage-summary"
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
  capabilities: { canValidate: boolean; canActivate: boolean; canViewAudit: boolean }
}) {
  const isEmpty = !overview.activeRelease && !overview.draftRelease
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Business Configuration</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Review what is live, what is still a draft, and what must be resolved before settings can affect future bookings.
        </p>
      </div>

      {isEmpty ? <ConfigurationEmptyState /> : null}
      <ConfigurationHealthSummary
        status={overview.overallStatus}
        blockers={overview.blockers.length}
        warnings={overview.warnings.length}
        draftChanges={overview.changedDomains.length}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ReleaseSummaryCard title="Current live configuration" release={overview.activeRelease} emptyMessage="No configuration release is active. Legacy booking pricing remains in effect." />
        <ReleaseSummaryCard title="Latest draft" release={overview.draftRelease} emptyMessage="There is no draft release awaiting review." />
      </div>

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
          fleetCoverage={`${overview.fleetCoverage.dailyRates} of ${overview.fleetCoverage.totalVehicles} vehicles have daily rates`}
          canValidate={capabilities.canValidate}
          canActivate={capabilities.canActivate}
        />
      ) : null}

      <DraftLiveComparison live={overview.activeRelease} draft={overview.draftRelease} changedDomains={overview.changedDomains} />

      <section>
        <div className="mb-3"><h2 className="font-semibold">Configuration sections</h2><p className="text-sm text-muted-foreground">Editing forms marked as planned arrive in later phases.</p></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {overview.domainStatuses.map((domain) => <DomainStatusCard key={domain.domain} domain={domain} />)}
        </div>
      </section>

      <FleetCoverageSummary coverage={overview.fleetCoverage} />

      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Legal readiness</h2>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <p>Required documents: Rental terms and Privacy notice</p>
          <p>Published languages: {overview.legalHealth.publishedLanguages.join(", ") || "None"}</p>
          <p>Missing translations: {overview.legalHealth.missingTranslations.length}</p>
          <p>Unpublished drafts: {overview.legalHealth.unpublishedDrafts}</p>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ConfigurationIssueList title="Blocking issues" issues={overview.blockers} emptyMessage="No blockers found." />
        <ConfigurationIssueList title="Warnings" issues={overview.warnings} emptyMessage="No warnings found." />
      </div>

      <CapabilityGuard allowed={capabilities.canViewAudit}>
        <AuditEventList events={overview.recentAuditEvents} />
      </CapabilityGuard>
    </div>
  )
}
