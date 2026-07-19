import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { requireCapability } from "@/lib/authorization/server"
import {
  recordRecoveryEvidence,
  recoveryEvidenceSchema,
} from "@/lib/production/operational-evidence"
import { validIdempotencyKey } from "@/lib/production/request-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "production")
    return Response.json(
      { code: "PRODUCTION_ONLY" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    )
  let operator
  try {
    operator = await requireCapability(CAPABILITIES.SECURITY_AUDIT_VIEW, { auditDenied: true })
  } catch {
    return Response.json(
      { code: "OPERATIONAL_ACCESS_REQUIRED" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    )
  }
  const idempotencyKey = validIdempotencyKey(request)
  if (!idempotencyKey)
    return Response.json(
      { code: "IDEMPOTENCY_KEY_REQUIRED" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    )
  const parsed = recoveryEvidenceSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success)
    return Response.json(
      { code: "INVALID_RECOVERY_EVIDENCE" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    )
  const result = await recordRecoveryEvidence({
    body: parsed.data,
    operatorId: operator.id,
    environment: "production",
    idempotencyKey,
  })
  const status = result.status === "DUPLICATE" ? 409 : result.status === "INVALID_FUTURE_TIMESTAMP" ? 400 : 201
  return Response.json(result, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}
