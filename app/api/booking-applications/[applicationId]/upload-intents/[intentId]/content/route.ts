import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import { loadOwnedApplicationDocumentLifecycle } from "@/lib/private-documents/server/lifecycle-context"
import { enforceRateLimit, PHASE8FB_RATE_LIMITS, RateLimitExceededError } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PUT(request: Request, { params }: { params: Promise<{ applicationId: string; intentId: string }> }) {
  let rateLimitSubject: string | undefined
  let applicationIdForLog = "unresolved"
  let intentIdForLog = "unresolved"
  try {
    const { applicationId, intentId } = await params
    applicationIdForLog = applicationId
    intentIdForLog = intentId
    const context = await loadOwnedApplicationDocumentLifecycle(applicationId)
    rateLimitSubject = context.user.id
    await enforceRateLimit("upload:content", context.user.id, PHASE8FB_RATE_LIMITS.uploadComplete)
    const contentLength = Number(request.headers.get("content-length") ?? 0)
    if (contentLength > 10 * 1024 * 1024)
      throw new PrivateDocumentError("DOCUMENT_FILE_TOO_LARGE", "Document exceeds the upload limit.")
    const bytes = new Uint8Array(await request.arrayBuffer())
    if (bytes.byteLength < 1 || bytes.byteLength > 10 * 1024 * 1024)
      throw new PrivateDocumentError("DOCUMENT_FILE_TOO_LARGE", "Document exceeds the upload limit.")
    await context.lifecycle.stageDisposableUpload(intentId, context.user.id, bytes)
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (rateLimitSubject && error instanceof PrivateDocumentError) {
      try {
        await enforceRateLimit("upload:invalid", rateLimitSubject, PHASE8FB_RATE_LIMITS.invalidUpload)
      } catch (rateLimitError) {
        if (rateLimitError instanceof RateLimitExceededError)
          return Response.json({ code: "RATE_LIMITED" }, { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(rateLimitError.retryAfterSeconds) } })
      }
    }
    const code = error instanceof PrivateDocumentError ? error.code : error instanceof RateLimitExceededError ? "RATE_LIMITED" : "DOCUMENT_UPLOAD_FAILED"
    const status = code === "RATE_LIMITED" ? 429 : code === "DOCUMENT_FILE_TOO_LARGE" ? 413 : 409
    const retryAfter = error instanceof RateLimitExceededError ? String(error.retryAfterSeconds) : undefined
    console.warn("[private-documents] upload content rejected", {
      applicationId: applicationIdForLog,
      intentId: intentIdForLog,
      code,
      retryable: error instanceof PrivateDocumentError ? error.retryable : false,
    })
    return Response.json({ code }, { status, headers: { "Cache-Control": "private, no-store", ...(retryAfter ? { "Retry-After": retryAfter } : {}) } })
  }
}
