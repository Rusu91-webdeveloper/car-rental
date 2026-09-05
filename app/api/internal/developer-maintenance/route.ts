import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireRecentMaintenanceDeveloper } from "@/lib/developer-maintenance/authorization"
import { runDeveloperMaintenanceCleanup } from "@/lib/developer-maintenance/service"
import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const requestSchema = z.object({
  confirmation: z.literal("DELETE ELIGIBLE DATA"),
})

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin")
    if (!origin || origin !== new URL(request.url).origin)
      return Response.json(
        { code: "MAINTENANCE_ORIGIN_DENIED" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      )
    requestSchema.parse(await request.json())
    const { user, evidence } = await requireRecentMaintenanceDeveloper()
    await enforceRateLimit(
      "developer-maintenance",
      user.id,
      { limit: 3, windowMs: 10 * 60_000 },
    )
    const result = await runDeveloperMaintenanceCleanup({
      developerId: user.id,
      recentAuthenticationEvidence: evidence,
    })
    revalidatePath("/[locale]/admin/health", "page")
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json(
        { code: "MAINTENANCE_CONFIRMATION_REQUIRED" },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      )
    if (error instanceof RateLimitExceededError)
      return Response.json(
        { code: "MAINTENANCE_RATE_LIMITED" },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": String(error.retryAfterSeconds),
          },
        },
      )
    const message = error instanceof Error ? error.message : "Maintenance cleanup failed."
    const authorizationFailure =
      (error instanceof PrivateDocumentError && error.code.startsWith("RECENT_AUTH_")) ||
      message.includes("Forbidden") ||
      message.includes("authentication") ||
      message.startsWith("RECENT_AUTH_")
    return Response.json(
      {
        code: authorizationFailure
          ? "MAINTENANCE_AUTHENTICATION_REQUIRED"
          : "MAINTENANCE_CLEANUP_FAILED",
      },
      {
        status: authorizationFailure ? 403 : 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    )
  }
}
