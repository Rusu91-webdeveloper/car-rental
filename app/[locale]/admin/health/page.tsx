import { requireAdmin } from "@/lib/auth"
import { getProductionHealthReport } from "@/lib/production/health"

export const dynamic = "force-dynamic"

const statusClass = {
  PASS: "bg-emerald-100 text-emerald-900",
  WARN: "bg-amber-100 text-amber-900",
  FAIL: "bg-red-100 text-red-900",
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
            <p className="mt-3 text-sm text-muted-foreground">{item.summary}</p>
          </section>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        This dashboard exposes operational state only. It never displays customer data, document identifiers, Blob paths, credentials, or tokens.
      </p>
    </main>
  )
}
