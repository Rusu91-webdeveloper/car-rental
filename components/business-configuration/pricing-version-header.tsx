import { ConfigurationStatusBadge } from "./configuration-status-badge"
import type { PricingAdminPageData } from "@/lib/pricing-admin/types"

export function PricingVersionHeader({ data, title, description }: { data: PricingAdminPageData; title: string; description: string }) {
  const status = data.draftPricing?.validationStatus ?? data.livePricing?.validationStatus ?? "NOT_CONFIGURED"
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold">{title}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p></div>
        <ConfigurationStatusBadge status={status} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Version label="Live pricing" value={data.livePricing ? `Version ${data.livePricing.versionNumber}` : "Legacy compatibility"} />
        <Version label="Draft pricing" value={data.draftPricing ? `Version ${data.draftPricing.versionNumber}` : "No draft"} />
        <Version label="Live rate set" value={data.liveFleet ? `Version ${data.liveFleet.versionNumber}` : "Car.price"} />
        <Version label="Draft rate set" value={data.draftFleet ? `Version ${data.draftFleet.versionNumber}` : "No draft"} />
      </div>
      {data.draftPricing ? <p className="text-xs text-muted-foreground">Last edited by {data.draftPricing.updatedBy} on {new Date(data.draftPricing.updatedAt).toLocaleString()} · revision {data.draftPricing.revision}</p> : null}
    </header>
  )
}

function Version({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>
}
