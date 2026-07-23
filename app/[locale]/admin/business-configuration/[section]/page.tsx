import Link from "@/navigation"
import { notFound } from "next/navigation"
import { ConfigurationStatusBadge } from "@/components/business-configuration/configuration-status-badge"
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadConfigurationOverview } from "@/lib/business-configuration/workflow-service"
import { loadNotificationConfigurationPage } from "@/lib/notification-configuration/service"
import { PaymentInstructionForm } from "@/components/business-configuration/notification-configuration-form"
import { ConfirmationContentForm } from "@/components/business-configuration/confirmation-content-form"
import { NotificationDraftControl } from "@/components/business-configuration/notification-draft-control"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

const sections = {
  documents: { label: "Documents", domain: "document-policy", permission: "canViewDocuments", note: "Document requirements and uploads are planned for a later phase." },
  payments: { label: "Payments", domain: "payments", permission: "canView", note: "Configure offline payment instructions for booking-confirmation emails." },
  confirmations: { label: "Confirmations", domain: "confirmations", permission: "canView", note: "Configure localized content and the sections included in booking confirmations." },
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
  if (section === "payments" || section === "confirmations") {
    const [data, paymentProfile] = await Promise.all([
      loadNotificationConfigurationPage(),
      section === "payments" ? prisma.companySettings.findUnique({ where: { id: "company-settings" } }) : null,
    ])
    if (section === "payments" && !paymentProfile) throw new Error("Payment settings are unavailable.")
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">{metadata.label}</h1><p className="mt-1 text-sm text-muted-foreground">{metadata.note}</p></div>
        <section className="rounded-xl border bg-background p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Current status</h2><p className="mt-2 text-sm text-muted-foreground">Live: {status?.liveVersion ? `Version ${status.liveVersion}` : "Not configured"} · Draft: {status?.draftVersion ? `Version ${status.draftVersion}` : "None"}</p></div>{status ? <ConfigurationStatusBadge status={status.status} /> : null}</div></section>
        <NotificationDraftControl key={data.draftRelease?.revision ?? "no-draft"} data={data} canEdit={capabilities.canEdit && capabilities.canManagePayments && capabilities.canManageConfirmations} />
        {section === "payments" ? <PaymentInstructionForm key={`${data.draftPayment?.id ?? "live"}-${data.draftPayment?.revision ?? 0}`} data={data} paymentProfile={paymentProfile!} canEdit={capabilities.canManagePayments} /> : <ConfirmationContentForm key={`${data.draftConfirmation?.id ?? "live"}-${data.draftConfirmation?.revision ?? 0}`} data={data} canEdit={capabilities.canManageConfirmations} />}
        <Link href="/admin/business-configuration/overview" className="inline-block text-sm font-medium text-primary hover:underline">Back to Overview</Link>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{metadata.label}</h1><p className="mt-1 text-sm text-muted-foreground">{metadata.note}</p></div>
      <section className="rounded-xl border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Current status</h2><p className="mt-2 text-sm text-muted-foreground">Live: {status?.liveVersion ? `Version ${status.liveVersion}` : "Not configured"} · Draft: {status?.draftVersion ? `Version ${status.draftVersion}` : "None"}</p></div>{status ? <ConfigurationStatusBadge status={status.status} /> : null}</div>
        <div className="mt-5 rounded-lg border border-dashed bg-muted/20 p-5"><p className="font-medium">Planned</p><p className="mt-1 text-sm text-muted-foreground">No editing controls are available in Phase 4. This page provides status visibility without implying that changes can be saved.</p></div>
      </section>
      <Link href="/admin/business-configuration/overview" className="inline-block text-sm font-medium text-primary hover:underline">Back to Overview</Link>
    </div>
  )
}
