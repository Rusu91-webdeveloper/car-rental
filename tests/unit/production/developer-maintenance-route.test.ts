import { beforeEach, describe, expect, it, vi } from "vitest"

const requireRecentMaintenanceDeveloper = vi.hoisted(() => vi.fn())
const runDeveloperMaintenanceCleanup = vi.hoisted(() => vi.fn())
const enforceRateLimit = vi.hoisted(() => vi.fn())
const revalidatePath = vi.hoisted(() => vi.fn())

vi.mock("server-only", () => ({}))
vi.mock("@/lib/developer-maintenance/authorization", () => ({
  requireRecentMaintenanceDeveloper,
}))
vi.mock("@/lib/developer-maintenance/service", () => ({
  runDeveloperMaintenanceCleanup,
}))
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/rate-limit")>()
  return { ...original, enforceRateLimit }
})
vi.mock("next/cache", () => ({ revalidatePath }))

import { POST } from "@/app/api/internal/developer-maintenance/route"

const url = "https://rental.example/api/internal/developer-maintenance"

function request(confirmation = "DELETE ELIGIBLE DATA", origin = "https://rental.example") {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ confirmation }),
  })
}

describe("developer maintenance route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRecentMaintenanceDeveloper.mockResolvedValue({
      user: { id: "developer-1" },
      evidence: {
        provider: "google",
        authenticatedAt: new Date("2026-07-27T12:00:00.000Z"),
        serverVerified: true,
      },
    })
    runDeveloperMaintenanceCleanup.mockResolvedValue({
      deletedDocuments: 0,
      documentFailures: [],
      deletedLogs: {
        auditEvents: 0,
        adminAuditLogs: 0,
        workerExecutions: 0,
      },
    })
  })

  it("rejects cross-origin requests before authentication", async () => {
    const response = await POST(request(undefined, "https://attacker.example"))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ code: "MAINTENANCE_ORIGIN_DENIED" })
    expect(requireRecentMaintenanceDeveloper).not.toHaveBeenCalled()
  })

  it("requires the exact destructive confirmation phrase", async () => {
    const response = await POST(request("delete everything"))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      code: "MAINTENANCE_CONFIRMATION_REQUIRED",
    })
    expect(requireRecentMaintenanceDeveloper).not.toHaveBeenCalled()
  })

  it("runs only after developer authentication and rate limiting", async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(enforceRateLimit).toHaveBeenCalledWith(
      "developer-maintenance",
      "developer-1",
      { limit: 3, windowMs: 600_000 },
    )
    expect(runDeveloperMaintenanceCleanup).toHaveBeenCalledWith({
      developerId: "developer-1",
      recentAuthenticationEvidence: expect.objectContaining({
        provider: "google",
        serverVerified: true,
      }),
    })
    expect(revalidatePath).toHaveBeenCalledWith(
      "/[locale]/admin/health",
      "page",
    )
  })

  it("does not disclose authorization details", async () => {
    requireRecentMaintenanceDeveloper.mockRejectedValue(
      new Error("Forbidden: Developer maintenance access required"),
    )

    const response = await POST(request())

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      code: "MAINTENANCE_AUTHENTICATION_REQUIRED",
    })
    expect(runDeveloperMaintenanceCleanup).not.toHaveBeenCalled()
  })
})
