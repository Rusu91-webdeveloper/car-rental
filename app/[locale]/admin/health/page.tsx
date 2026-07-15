import { requireAdmin } from "@/lib/auth"
import { getProductionHealthReport } from "@/lib/production/health"

export const dynamic = "force-dynamic"

const statusClass = {
  READY: "bg-emerald-100 text-emerald-900",
  PENDING: "bg-blue-100 text-blue-900",
  STALE: "bg-amber-100 text-amber-900",
  MANUAL_VERIFICATION_REQUIRED: "bg-amber-100 text-amber-900",
  BLOCKED: "bg-red-100 text-red-900",
  FAILING: "bg-red-100 text-red-900",
  NOT_CONFIGURED: "bg-slate-200 text-slate-900",
} as const

export default async function ProductionHealthPage() {
  await requireAdmin()
  const report = await getProductionHealthReport()
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div>
        <p className="text-sm text-muted-foreground">Production operations</p>
        <h1 className="text-3xl font-semibold">Launch health</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {report.status} · generated {new Date(report.generatedAt).toLocaleString()}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {report.checks.map((item) => (
          <section key={item.key} className="rounded-xl border bg-card p-5 text-card-foreground">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">{item.label}</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[item.status]}`}>
                {item.status}
              </span>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-medium">Evidence</dt>
                <dd className="mt-1 text-muted-foreground">{item.evidence}</dd>
              </div>
              <div>
                <dt className="font-medium">Last verified</dt>
                <dd className="mt-1 text-muted-foreground">{item.lastVerifiedAt ? new Date(item.lastVerifiedAt).toLocaleString() : "No valid evidence"}</dd>
              </div>
              {item.blockedReason ? (
                <div>
                  <dt className="font-medium">Why blocked</dt>
                  <dd className="mt-1 text-muted-foreground">{item.blockedReason}</dd>
                </div>
              ) : null}
              <div>
                <dt className="font-medium">Remediation</dt>
                <dd className="mt-1 text-muted-foreground">{item.remediation}</dd>
              </div>
              <div>
                <dt className="font-medium">Verification</dt>
                <dd className="mt-1 text-muted-foreground">{item.verificationMode === "AUTOMATIC" ? "Automatic evidence" : "Manual action with durable evidence"}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        This dashboard exposes operational state only. It never displays customer data, document identifiers, Blob paths, credentials, or tokens.
      </p>
    </main>
  )
}
