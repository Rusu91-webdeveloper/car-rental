import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadLegalAdministrationPage } from "@/lib/legal/service"
import { LegalDocumentList } from "@/components/legal/legal-document-list"
import { LegalAcceptanceConfigurationForm } from "@/components/legal/legal-acceptance-configuration-form"
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list"

export const dynamic = "force-dynamic"
export default async function LegalAdministrationPage() {
  const [capabilities, data] = await Promise.all([getBusinessConfigurationCapabilities(), loadLegalAdministrationPage()])
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Legal documents and booking acknowledgement</h1><p className="mt-1 text-sm text-muted-foreground">Draft and publish immutable Rental Terms and Privacy Notices, then select exact versions for a future configuration release.</p></div><LegalDocumentList data={data} canEdit={capabilities.canEditLegal} canPublish={capabilities.canPublishLegal} canValidate={capabilities.canValidate}/><LegalAcceptanceConfigurationForm data={data} canEdit={capabilities.canEditLegal} canValidate={capabilities.canValidate} canAttach={capabilities.canEdit}/><PricingIssueList title="Legal readiness" issues={data.issues}/></div>
}
