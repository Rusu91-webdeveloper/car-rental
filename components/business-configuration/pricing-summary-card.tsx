import type { PricingCoverageView } from "@/lib/pricing-admin/types"

export function PricingSummaryCard({ coverage, currency }: { coverage: PricingCoverageView; currency: string }) {
  const values = [
    ["Active cars", coverage.totalActiveVehicles],
    ["Daily prices", coverage.dailyRates],
    ["Weekly prices", coverage.weeklyRates],
    ["Monthly prices", coverage.monthlyRates],
    ["Missing required", coverage.missingRequiredRates],
    ["Not included", coverage.vehiclesNotInDraft],
  ] as const
  return (
    <section className="rounded-xl border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Do all active cars have a price?</h2>
          <p className="text-sm text-muted-foreground">All prices are shown in {currency}.</p>
        </div>
        <p className={coverage.currencyConsistent ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{coverage.currencyConsistent ? "Currency looks right" : "Check the currency"}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {values.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/50 p-3">
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm">
        <span className="font-medium text-destructive">{coverage.blockers} must fix</span> · <span className="font-medium text-amber-700">{coverage.warnings} worth checking</span>
      </p>
    </section>
  )
}
