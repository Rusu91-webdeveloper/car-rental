import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { requireCapability } from "@/lib/authorization/server"
import {
  alertConfirmationSchema,
  confirmAlertDelivery,
} from "@/lib/production/operational-evidence"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ evidenceId: string }> },
) {
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
  const parsed = alertConfirmationSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success)
    return Response.json(
      { code: "INVALID_ALERT_CONFIRMATION" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    )
  const { evidenceId } = await params
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(evidenceId))
    return Response.json(
      { code: "INVALID_EVIDENCE_ID" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    )
  const result = await confirmAlertDelivery({
    evidenceId,
    operatorId: operator.id,
    body: parsed.data,
  })
  return Response.json(result, {
    status: result.status === "NOT_CONFIRMABLE" ? 409 : 200,
    headers: { "Cache-Control": "private, no-store" },
  })
}
