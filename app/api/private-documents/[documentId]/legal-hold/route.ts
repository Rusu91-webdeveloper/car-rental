import { z } from "zod"
import { DocumentLegalHoldService } from "@/lib/private-documents/application/legal-hold-service"
import { ServerSessionRecentAuthenticationVerifier } from "@/lib/private-documents/authorization/recent-auth"
import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import { loadPrivateDocumentRequestContext } from "@/lib/private-documents/server/request-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params
    const value = z.object({ reason: z.string().trim().min(1).max(500), reviewAt: z.string().datetime().optional() }).parse(await request.json())
    const context = await loadPrivateDocumentRequestContext(documentId)
    const service = new DocumentLegalHoldService(context.repository, new ServerSessionRecentAuthenticationVerifier(), undefined, context.recentAuthMaximumAgeMs)
    const hold = await service.apply({ documentId, actor: context.actor, permission: context.permission, evidence: context.evidence, reason: value.reason, reviewAt: value.reviewAt ? new Date(value.reviewAt) : undefined })
    return Response.json({ id: hold.id, revision: hold.revision }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const code = error instanceof PrivateDocumentError ? error.code : "DOCUMENT_LEGAL_HOLD_REQUEST_FAILED"
    return Response.json({ code }, { status: code.startsWith("RECENT_AUTH_") ? 401 : 409, headers: { "Cache-Control": "private, no-store" } })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params
    const value = z.object({ holdId: z.string().min(1), expectedRevision: z.number().int().positive(), reason: z.string().trim().min(1).max(500) }).parse(await request.json())
    const context = await loadPrivateDocumentRequestContext(documentId)
    const service = new DocumentLegalHoldService(context.repository, new ServerSessionRecentAuthenticationVerifier(), undefined, context.recentAuthMaximumAgeMs)
    const hold = await service.release({ documentId, actor: context.actor, permission: context.permission, evidence: context.evidence, ...value })
    return Response.json({ id: hold.id, revision: hold.revision, releasedAt: hold.releasedAt }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const code = error instanceof PrivateDocumentError ? error.code : "DOCUMENT_LEGAL_HOLD_REQUEST_FAILED"
    return Response.json({ code }, { status: code.startsWith("RECENT_AUTH_") ? 401 : 409, headers: { "Cache-Control": "private, no-store" } })
  }
}
