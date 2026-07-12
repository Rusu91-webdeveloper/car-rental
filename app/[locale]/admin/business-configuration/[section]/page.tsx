import Link from "@/navigation"
import { notFound } from "next/navigation"
import { ConfigurationStatusBadge } from "@/components/business-configuration/configuration-status-badge"
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadConfigurationOverview } from "@/lib/business-configuration/workflow-service"

export const dynamic = "force-dynamic"

const sections = {
  pricing: { label: "Pricing", domain: "pricing-billing", permission: "canManagePricing", note: "Read-only pricing engine and fleet coverage evidence is available now. Editing arrives in Phase 5." },
  billing: { label: "Billing rules", domain: "pricing-billing", permission: "canManagePricing", note: "Billable duration, tax, and rate-strategy forms arrive in Phase 5." },
  insurance: { label: "Insurance", domain: "insurance", permission: "canView", note: "Insurance configuration is planned for a later phase." },
  "driver-requirements": { label: "Driver requirements", domain: "customer-driver-requirements", permission: "canView", note: "Driver eligibility forms are planned for a later phase." },
  "customer-information": { label: "Customer information", domain: "customer-driver-requirements", permission: "canView", note: "Customer-field forms are planned for a later phase." },
  "booking-flow": { label: "Booking flow", domain: "booking-workflow", permission: "canView", note: "Configurable booking steps are planned for a later phase." },
  documents: { label: "Documents", domain: "document-policy", permission: "canViewDocuments", note: "Document requirements and uploads are planned for a later phase." },
  payments: { label: "Payments", domain: "payments", permission: "canView", note: "Payment configuration and integrations are planned for a later phase." },
  legal: { label: "Legal", domain: "legal-acceptance", permission: "canEditLegal", note: "Legal publication and acceptance forms are planned for a later phase." },
  confirmations: { label: "Confirmations", domain: "confirmations", permission: "canView", note: "Confirmation-content forms are planned for a later phase." },
  advanced: { label: "Advanced", domain: "general-rental", permission: "canView", note: "Advanced identifiers and low-level controls remain read-only." },
} as const

export default async function ConfigurationSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  const metadata = sections[section as keyof typeof sections]
  if (!metadata) notFound()
  const capabilities = await getBusinessConfigurationCapabilities()
  if (!capabilities[metadata.permission]) {
    return <div className="rounded-xl border bg-background p-8 text-center"><h1 className="text-xl font-semibold">Access denied</h1><p className="mt-2 text-sm text-muted-foreground">You do not have permission to view this configuration section.</p></div>
  }
  const overview = await loadConfigurationOverview({ includeAudit: false })
  const status = overview.domainStatuses.find(({ domain }) => domain === metadata.domain)
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{metadata.label}</h1><p className="mt-1 text-sm text-muted-foreground">{metadata.note}</p></div>
      <section className="rounded-xl border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Current status</h2><p className="mt-2 text-sm text-muted-foreground">Live: {status?.liveVersion ? `Version ${status.liveVersion}` : "Not configured"} · Draft: {status?.draftVersion ? `Version ${status.draftVersion}` : "None"}</p></div>{status ? <ConfigurationStatusBadge status={status.status} /> : null}</div>
        <div className="mt-5 rounded-lg border border-dashed bg-muted/20 p-5"><p className="font-medium">Planned</p><p className="mt-1 text-sm text-muted-foreground">No editing controls are available in Phase 4. This page provides status visibility without implying that changes can be saved.</p></div>
      </section>
      {metadata.domain === "pricing-billing" ? <section className="rounded-xl border bg-background p-6"><h2 className="font-semibold">Read-only fleet evidence</h2><p className="mt-2 text-sm text-muted-foreground">{overview.fleetCoverage.dailyRates} of {overview.fleetCoverage.totalVehicles} bookable vehicles have daily rates in the candidate source. Weekly missing: {overview.fleetCoverage.missingWeeklyRates}. Monthly missing: {overview.fleetCoverage.missingMonthlyRates}.</p></section> : null}
      <Link href="/admin/business-configuration/overview" className="inline-block text-sm font-medium text-primary hover:underline">Back to Overview</Link>
    </div>
  )
}
