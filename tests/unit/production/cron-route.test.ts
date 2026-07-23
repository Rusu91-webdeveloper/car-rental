import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const executeProtectedWorker = vi.hoisted(() => vi.fn(async (input: { job: string }) => ({
  status: "SUCCEEDED" as const,
  invocationId: `invocation-${input.job}`,
})))

vi.mock("@/lib/production/worker-execution", () => ({ executeProtectedWorker }))
vi.mock("@/lib/production/worker-jobs", () => ({
  executeProductionWorkerJob: vi.fn(),
  summarizeProductionWorkerResult: vi.fn(() => ({})),
}))
vi.mock("@/lib/booking-expiration", () => ({
  runBookingLifecycleMaintenance: vi.fn(async () => ({
    cancelled: 0,
    completed: 0,
    completionEmailsFailed: 0,
    notifications: { examined: 0, sent: 0, failed: 0 },
  })),
}))

import { GET as getPhase8fbMaintenance } from "@/app/api/cron/phase8fb-maintenance/route"
import { GET as getBookingMaintenance } from "@/app/api/cron/cancel-expired-bookings/route"

describe("Phase 8F-B cron route", () => {
  const previous = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    CRON_SECRET: process.env.CRON_SECRET,
    PHASE8FB_WORKERS_ENABLED: process.env.PHASE8FB_WORKERS_ENABLED,
    PHASE8FB_WORKER_JOBS_ENABLED: process.env.PHASE8FB_WORKER_JOBS_ENABLED,
    BOOKING_MAINTENANCE_WORKER_ENABLED: process.env.BOOKING_MAINTENANCE_WORKER_ENABLED,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VERCEL_ENV = "production"
    process.env.CRON_SECRET = "synthetic-cron-secret-at-least-32-characters"
    process.env.PHASE8FB_WORKERS_ENABLED = "true"
    process.env.PHASE8FB_WORKER_JOBS_ENABLED = "application-expiry,review-backlog"
    process.env.BOOKING_MAINTENANCE_WORKER_ENABLED = "true"
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("rejects missing or invalid cron authentication before dispatch", async () => {
    expect((await getPhase8fbMaintenance(new Request("https://example.test/api/cron/phase8fb-maintenance"))).status).toBe(401)
    expect((await getPhase8fbMaintenance(new Request("https://example.test/api/cron/phase8fb-maintenance", {
      headers: { authorization: "Bearer wrong" },
    }))).status).toBe(401)
    expect(executeProtectedWorker).not.toHaveBeenCalled()
  })

  it("rejects Preview and Development even with the correct cron secret", async () => {
    process.env.VERCEL_ENV = "preview"
    const response = await getPhase8fbMaintenance(new Request("https://example.test/api/cron/phase8fb-maintenance", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }))
    expect(response.status).toBe(403)
    expect(executeProtectedWorker).not.toHaveBeenCalled()
  })

  it("dispatches exactly the fixed automatic allowlist for valid cron authentication", async () => {
    const response = await getPhase8fbMaintenance(new Request("https://example.test/api/cron/phase8fb-maintenance?job=failed-deletion-retry", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }))
    expect(response.status).toBe(200)
    expect(executeProtectedWorker.mock.calls.map(([input]) => input.job)).toEqual([
      "application-expiry",
      "review-backlog",
    ])
  })

  it("stops the sequential batch when the request-level deadline is exhausted", async () => {
    const clock = vi.spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(50_000)
    const response = await getPhase8fbMaintenance(new Request("https://example.test/api/cron/phase8fb-maintenance", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }))
    clock.mockRestore()
    expect(response.status).toBe(503)
    expect(executeProtectedWorker).toHaveBeenCalledTimes(1)
    expect(await response.json()).toMatchObject({
      status: "FAILED",
      executions: [
        { job: "application-expiry", status: "SUCCEEDED" },
        { job: "review-backlog", status: "ROUTE_DEADLINE_EXCEEDED" },
      ],
    })
  })

  it("applies the same Production-only and bearer checks to booking maintenance", async () => {
    process.env.VERCEL_ENV = "preview"
    expect((await getBookingMaintenance(new Request("https://example.test/api/cron/cancel-expired-bookings", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }))).status).toBe(403)
    process.env.VERCEL_ENV = "production"
    expect((await getBookingMaintenance(new Request("https://example.test/api/cron/cancel-expired-bookings"))).status).toBe(401)
  })
})
