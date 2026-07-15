import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { prisma } from "@/lib/db"
import { PrismaDocumentConfigurationRepository } from "@/lib/document-configuration/prisma-repository"
import { readPrivateDocumentEnvironment } from "@/lib/private-documents/infrastructure/environment"
import { DocumentPolicyEditor } from "./policy-editor"

export const dynamic = "force-dynamic"

export default async function DocumentsConfigurationPage() {
  const capabilities = await getBusinessConfigurationCapabilities()
  if (!capabilities.canViewDocuments)
    return <div className="rounded-xl border bg-background p-8 text-center"><h1 className="text-xl font-semibold">Access denied</h1><p className="mt-2 text-sm text-muted-foreground">An explicit restricted document role is required.</p></div>
  const environment = readPrivateDocumentEnvironment()
  const data = await new PrismaDocumentConfigurationRepository(prisma).load(
    capabilities.canEdit,
    environment.issues.length ? environment.issues : ["DOCUMENT_NONPRODUCTION_WORKFLOW_DISABLED"],
  )
  return <DocumentPolicyEditor data={data} />
}
