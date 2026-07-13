import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import { loadOwnedApplicationDocumentLifecycle } from "@/lib/private-documents/server/lifecycle-context"
import { enforceRateLimit, PHASE8FB_RATE_LIMITS, RateLimitExceededError } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(_request: Request, { params }: { params: Promise<{ applicationId: string; intentId: string }> }) {
  let rateLimitSubject: string | undefined
  try {
    const { applicationId, intentId } = await params
    const context = await loadOwnedApplicationDocumentLifecycle(applicationId)
    rateLimitSubject = context.user.id
    enforceRateLimit("upload:complete", context.user.id, PHASE8FB_RATE_LIMITS.uploadComplete)
    const document = await context.lifecycle.completeDocumentUpload({ intentId, customerUserId: context.user.id })
    return Response.json({
      documentId: document.id,
      uploadStatus: document.uploadStatus,
      manualReviewStatus: document.manualReviewStatus,
      reviewRevision: document.reviewRevision,
    }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (rateLimitSubject && error instanceof PrivateDocumentError) {
      try {
        enforceRateLimit("upload:invalid", rateLimitSubject, PHASE8FB_RATE_LIMITS.invalidUpload)
      } catch (rateLimitError) {
        if (rateLimitError instanceof RateLimitExceededError)
          return Response.json({ code: "RATE_LIMITED" }, { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(rateLimitError.retryAfterSeconds) } })
      }
    }
    const code = error instanceof PrivateDocumentError ? error.code : error instanceof RateLimitExceededError ? "RATE_LIMITED" : "DOCUMENT_UPLOAD_FAILED"
    const retryAfter = error instanceof RateLimitExceededError ? String(error.retryAfterSeconds) : undefined
    return Response.json({ code }, { status: code === "RATE_LIMITED" ? 429 : 409, headers: { "Cache-Control": "private, no-store", ...(retryAfter ? { "Retry-After": retryAfter } : {}) } })
  }
}
