import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { requireCapability } from "@/lib/authorization/server"
import { sendProductionAlertTest } from "@/lib/email"
import { verifyAlertDelivery } from "@/lib/production/operational-evidence"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
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
  const recipient = process.env.PRODUCTION_ALERT_RECIPIENT
  if (!recipient || !process.env.PRODUCTION_ALERT_OWNER)
    return Response.json(
      { code: "ALERT_OWNERSHIP_NOT_CONFIGURED" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    )
  const result = await verifyAlertDelivery({
    operatorId: operator.id,
    environment: "production",
    recipient,
    send: sendProductionAlertTest,
  })
  const status = result.status === "RATE_LIMITED" ? 429 : result.status === "FAILED" ? 503 : 200
  return Response.json(result, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}
