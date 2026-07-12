import type { FleetCoverageSummary as FleetCoverage } from "@/lib/business-configuration/workflow-service"

export function FleetCoverageSummary({ coverage }: { coverage: FleetCoverage }) {
  const items = [
    ["Bookable vehicles", coverage.totalVehicles],
    ["Vehicles with daily rates", coverage.dailyRates],
    ["Missing daily rates", coverage.missingDailyRates],
    ["Missing weekly rates", coverage.missingWeeklyRates],
    ["Missing monthly rates", coverage.missingMonthlyRates],
    ["Missing all release rates", coverage.missingAllReleaseRates],
  ] as const
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="font-semibold">Fleet coverage</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/50 p-3">
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
