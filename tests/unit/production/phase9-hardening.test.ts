import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const buckets = vi.hoisted(() => new Map<string, number>())
const database = vi.hoisted(() => ({
  rateLimitBucket: {
    upsert: vi.fn(async (input: { where: { scope_subjectHash_windowStartedAt: { scope: string; subjectHash: string; windowStartedAt: Date } } }) => {
      const value = input.where.scope_subjectHash_windowStartedAt
      const key = `${value.scope}:${value.subjectHash}:${value.windowStartedAt.toISOString()}`
      const count = (buckets.get(key) ?? 0) + 1
      buckets.set(key, count)
      return { count }
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
}))

vi.mock("@/lib/db", () => ({ prisma: database }))
vi.mock("server-only", () => ({}))

import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit"

describe("Phase 9 production hardening", () => {
  beforeEach(() => {
    buckets.clear()
    vi.clearAllMocks()
    process.env.RATE_LIMIT_HASH_SECRET = "synthetic-test-secret"
  })

  it("makes shared fixed-window rate-limit decisions and stores only a hash", async () => {
    const now = new Date("2026-07-14T10:00:30.000Z")
    await enforceRateLimit("application:create", "synthetic-user", { limit: 2, windowMs: 60_000 }, now)
    await enforceRateLimit("application:create", "synthetic-user", { limit: 2, windowMs: 60_000 }, now)
    await expect(
      enforceRateLimit("application:create", "synthetic-user", { limit: 2, windowMs: 60_000 }, now),
    ).rejects.toEqual(expect.objectContaining<Partial<RateLimitExceededError>>({ retryAfterSeconds: 30 }))
    const call = database.rateLimitBucket.upsert.mock.calls[0][0]
    expect(call.where.scope_subjectHash_windowStartedAt.subjectHash).toMatch(/^[a-f0-9]{64}$/)
    expect(call.where.scope_subjectHash_windowStartedAt.subjectHash).not.toContain("synthetic-user")
  })

  it("keeps detailed health server-protected and public health responses opaque", async () => {
    const root = resolve(process.cwd())
    const [dashboard, healthRoute, workerRoute, cronRoute, workerExecution, requestAuth, businessInfo] = await Promise.all([
      readFile(resolve(root, "app/[locale]/admin/health/page.tsx"), "utf8"),
      readFile(resolve(root, "app/api/health/route.ts"), "utf8"),
      readFile(resolve(root, "app/api/internal/phase8fb/[job]/route.ts"), "utf8"),
      readFile(resolve(root, "app/api/cron/cancel-expired-bookings/route.ts"), "utf8"),
      readFile(resolve(root, "lib/production/worker-execution.ts"), "utf8"),
      readFile(resolve(root, "lib/production/request-auth.ts"), "utf8"),
      readFile(resolve(root, "lib/business-info.ts"), "utf8"),
    ])
    expect(dashboard).toContain("await requireAdmin()")
    expect(healthRoute).not.toContain("error.message")
    expect(healthRoute).toContain('"Cache-Control": "no-store"')
    expect(workerRoute).toContain("executeProtectedWorker")
    expect(workerRoute).not.toContain('process.env.NODE_ENV === "production"')
    expect(cronRoute).toContain("BOOKING_MAINTENANCE_WORKER_ENABLED")
    expect(requestAuth).toContain("timingSafeEqual")
    expect(workerExecution).toContain("deduplicationKey")
    expect(workerExecution).toContain("WorkerLease")
    expect(businessInfo).not.toContain("companySettings.create")
    expect(businessInfo).not.toContain("companySettings.upsert")
    const bookingActions = await readFile(resolve(root, "app/actions/bookings.ts"), "utf8")
    expect(bookingActions).not.toContain("export async function createBooking(")
  })
})
