import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { prisma } from "@/lib/db"
import { PrismaDocumentConfigurationRepository } from "@/lib/document-configuration/prisma-repository"
import { readRuntimePrivateDocumentEnvironment } from "@/lib/private-documents/infrastructure/runtime-environment"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DocumentPolicyEditor } from "@/app/[locale]/admin/business-configuration/documents/policy-editor"
import { requireAdmin } from "@/lib/auth"
import {
  ensureOwnerDraftRelease,
  ownerSettingsPageMode,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit"

export default async function DocumentSettingsPage({ searchParams }: { searchParams: Promise<OwnerSettingsPageSearchParams> }) {
  const caps = await getBusinessConfigurationCapabilities()
  if (!caps.canViewDocuments)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">You do not have access to customer documents</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask an owner to grant document access.</p>
      </main>
    )
  const { editing, nextHref } = await ownerSettingsPageMode(searchParams, "/admin/payments")
  if (editing) await ensureOwnerDraftRelease((await requireAdmin()).id)
  const environment = await readRuntimePrivateDocumentEnvironment()
  const data = await new PrismaDocumentConfigurationRepository(prisma).load(
    caps.canEdit,
    environment.issues.length ? environment.issues : ["DOCUMENT_NONPRODUCTION_WORKFLOW_DISABLED"],
  )
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? "Edit settings" : "Business setup"}
        title="Which documents must customers provide?"
        description="Choose what customers upload for each booking."
      />
      <DocumentPolicyEditor data={data} nextHref={nextHref} />
    </main>
  )
}
