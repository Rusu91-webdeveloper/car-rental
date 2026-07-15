import type { ConfigurationDomainId } from "@/lib/business-configuration/types"
import { CONFIGURATION_DOMAIN_METADATA } from "@/lib/business-configuration/domain-metadata"
import type { ReleaseAggregate } from "@/lib/business-configuration/repositories"

export function DraftLiveComparison({
  live,
  draft,
  changedDomains,
}: {
  live: ReleaseAggregate | null
  draft: ReleaseAggregate | null
  changedDomains: readonly ConfigurationDomainId[]
}) {
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="font-semibold">Draft and live comparison</h2>
      {!draft ? (
        <p className="mt-2 text-sm text-muted-foreground">There is no draft release to compare.</p>
      ) : changedDomains.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">This draft uses the same domain versions as the live release.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="pb-2">Section</th><th className="pb-2">Live</th><th className="pb-2">Proposed</th></tr>
            </thead>
            <tbody>
              {changedDomains.map((domain) => (
                <tr key={domain} className="border-t">
                  <td className="py-3 font-medium">{CONFIGURATION_DOMAIN_METADATA[domain].label}</td>
                  <td className="py-3">{live ? `Version ${live.versions[domain].versionNumber}` : "Not configured"}</td>
                  <td className="py-3">Version {draft.versions[domain].versionNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
