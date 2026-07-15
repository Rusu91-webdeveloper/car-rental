import { z } from "zod"
import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import { loadOwnedApplicationDocumentLifecycle } from "@/lib/private-documents/server/lifecycle-context"
import { enforceRateLimit, PHASE8FB_RATE_LIMITS, RateLimitExceededError } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const schema = z.object({
  documentTypeId: z.string().min(1),
  side: z.enum(["SINGLE", "FRONT", "BACK"]),
  slotNumber: z.number().int().positive(),
  originalFileName: z.string().min(1).max(255),
  declaredMimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  expectedSizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  expectedChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().min(16).max(128),
  replacesDocumentId: z.string().optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  let rateLimitSubject: string | undefined
  try {
    const { applicationId } = await params
    const context = await loadOwnedApplicationDocumentLifecycle(applicationId)
    rateLimitSubject = context.user.id
    await enforceRateLimit("upload:intent", context.user.id, PHASE8FB_RATE_LIMITS.uploadIntent)
    const value = schema.parse(await request.json())
    const result = await context.lifecycle.createDocumentUploadIntent({
      ...value,
      sessionId: context.session.id,
      customerUserId: context.user.id,
    })
    return Response.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (rateLimitSubject && !(error instanceof RateLimitExceededError)) {
      try {
        await enforceRateLimit("upload:invalid", rateLimitSubject, PHASE8FB_RATE_LIMITS.invalidUpload)
      } catch (rateLimitError) {
        if (rateLimitError instanceof RateLimitExceededError)
          return Response.json({ code: "RATE_LIMITED" }, { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(rateLimitError.retryAfterSeconds) } })
      }
    }
    const code = error instanceof PrivateDocumentError ? error.code : error instanceof RateLimitExceededError ? "RATE_LIMITED" : "DOCUMENT_UPLOAD_REQUEST_INVALID"
    const retryAfter = error instanceof RateLimitExceededError ? String(error.retryAfterSeconds) : undefined
    return Response.json({ code }, { status: code === "RATE_LIMITED" ? 429 : 409, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...(retryAfter ? { "Retry-After": retryAfter } : {}) } })
  }
}
