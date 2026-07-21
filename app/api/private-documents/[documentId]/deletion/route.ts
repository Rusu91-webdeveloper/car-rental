import { z } from "zod"
import { DocumentDeletionService } from "@/lib/private-documents/application/deletion-service"
import { ServerSessionRecentAuthenticationVerifier } from "@/lib/private-documents/authorization/recent-auth"
import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import { readRuntimePrivateDocumentEnvironment } from "@/lib/private-documents/infrastructure/runtime-environment"
import { loadPrivateDocumentRequestContext } from "@/lib/private-documents/server/request-context"
import { createPrivateDocumentStorage } from "@/lib/private-documents/storage/factory"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params
    const value = z.object({ reason: z.string().trim().min(1).max(500), idempotencyKey: z.string().min(16).max(128) }).parse(await request.json())
    const context = await loadPrivateDocumentRequestContext(documentId)
    const environment = await readRuntimePrivateDocumentEnvironment()
    const storage = createPrivateDocumentStorage({ environment, localRoot: process.env.PRIVATE_DOCUMENT_LOCAL_ROOT ?? "/tmp/car-rental-private-documents" })
    const service = new DocumentDeletionService(context.repository, storage, new ServerSessionRecentAuthenticationVerifier(), undefined, 3, context.recentAuthMaximumAgeMs)
    const deletion = await service.request({ documentId, actor: context.actor, permission: context.permission, evidence: context.evidence, ...value })
    return Response.json({ id: deletion.id, status: deletion.status, revision: deletion.revision }, { status: 202, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const code = error instanceof PrivateDocumentError ? error.code : "DOCUMENT_DELETION_REQUEST_FAILED"
    return Response.json({ code }, { status: code.startsWith("RECENT_AUTH_") ? 401 : 409, headers: { "Cache-Control": "private, no-store" } })
  }
}
