import type { ConfigurationValidationIssue } from "@/lib/business-configuration/types"

export function PricingIssueList({ issues, title = "What needs attention" }: { issues: ConfigurationValidationIssue[]; title?: string }) {
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="font-semibold">{title}</h2>
      {issues.length === 0 ? (
        <p className="mt-2 text-sm text-emerald-700">Everything looks good.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.affectedResource ?? "global"}-${index}`} className={`rounded-lg border p-3 text-sm ${issue.severity === "BLOCKER" ? "border-destructive/30 bg-destructive/5" : "border-amber-300 bg-amber-50"}`}>
              <p className="font-medium">{issue.adminMessage}</p>
              {issue.remediation ? <p className="mt-1 text-muted-foreground">{issue.remediation}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
