import Link from "@/navigation"
import type { ConfigurationHealthFinding } from "@/lib/business-configuration/health"

export function ConfigurationIssueList({
  title,
  issues,
  emptyMessage,
}: {
  title: string
  issues: readonly ConfigurationHealthFinding[]
  emptyMessage?: string
}) {
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="font-semibold">{title}</h2>
      {issues.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage ?? "No issues found."}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {issues.map((issue) => (
            <li key={`${issue.domain}-${issue.code}-${issue.affectedResource ?? "general"}`} className="rounded-lg border p-3">
              <p className="text-sm font-medium">{issue.message}</p>
              {issue.affectedResource ? <p className="mt-1 text-xs text-muted-foreground">Affected: {issue.affectedResource}</p> : null}
              {issue.suggestedAction ? <p className="mt-2 text-sm text-muted-foreground">Next: {issue.suggestedAction}</p> : null}
              {issue.adminRoute ? (
                <Link href={issue.adminRoute} className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
                  Review this section
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
