import { AdminPageHeader } from "@/components/admin/admin-page-header"
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
const statusLabel = {
  READY: "Ready",
  PENDING: "Checking",
  STALE: "Check needed",
  MANUAL_VERIFICATION_REQUIRED: "Check needed",
  BLOCKED: "Action needed",
  FAILING: "Not working",
  NOT_CONFIGURED: "Set up needed",
} as const
const checkLabels: Record<string, string> = {
  database: "Can the app save bookings?",
  configuration: "Are business settings published?",
  pricing: "Can customers see valid prices?",
  legal: "Are terms and privacy available?",
  blob: "Are customer documents stored privately?",
  oidc: "Is private document access protected?",
  ownership: "Does every system task have an owner?",
  monitoring: "Will someone be warned about problems?",
  recovery: "Can business data be restored?",
  workers: "Are automatic housekeeping tasks running?",
  roles: "Do the right people have document access?",
  "review-queue": "Are document reviews up to date?",
  retention: "Are expired documents being removed?",
  audit: "Are important actions being recorded?",
  emails: "Can the app send email?",
}

export default async function ProductionHealthPage() {
  await requireAdmin()
  const report = await getProductionHealthReport()
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <AdminPageHeader
        eyebrow="More"
        title="Is the business ready to take bookings?"
        description={`${report.status === "READY" ? "Everything is ready." : "Some items need attention."} Last checked ${new Date(report.generatedAt).toLocaleString()}.`}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {report.checks.map((item) => (
          <section key={item.key} className="rounded-xl border bg-card p-5 text-card-foreground">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-medium">{checkLabels[item.key] ?? item.label}</h2>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[item.status]}`}>
                {statusLabel[item.status]}
              </span>
            </div>
            {item.status !== "READY" ? (
              <div className="mt-4 text-sm">
                <p className="font-medium">What to do</p>
                <p className="mt-1 text-muted-foreground">{item.remediation}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-emerald-700">No action needed.</p>
            )}
            <details className="mt-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Technical details</summary>
              <p className="mt-2">{item.evidence}</p>
              {item.lastVerifiedAt ? (
                <p className="mt-1">Last confirmed: {new Date(item.lastVerifiedAt).toLocaleString()}</p>
              ) : null}
            </details>
          </section>
        ))}
      </div>
    </main>
  )
}
