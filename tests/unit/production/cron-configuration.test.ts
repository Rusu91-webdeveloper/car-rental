import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { PRODUCTION_CRON_SCHEDULES } from "@/lib/production/cron-schedule"
import { AUTOMATED_PRODUCTION_WORKER_JOBS } from "@/lib/production/operations-environment"

describe("Vercel Cron configuration", () => {
  it("uses only the two fixed daily production routes and contains no secrets or query parameters", async () => {
    const config = JSON.parse(await readFile(resolve(process.cwd(), "vercel.json"), "utf8"))
    expect(config.crons).toEqual(PRODUCTION_CRON_SCHEDULES.map(({ path, schedule }) => ({ path, schedule })))
    expect(config.crons).toHaveLength(2)
    for (const cron of config.crons) {
      expect(cron.path).not.toContain("?")
      expect(cron.schedule).toMatch(/^\d+ \d+ \* \* \*$/)
    }
    expect(JSON.stringify(config)).not.toMatch(/secret|token|authorization/i)
  })

  it("dispatches only the approved non-destructive Phase 8F-B jobs", async () => {
    const route = await readFile(
      resolve(process.cwd(), "app/api/cron/phase8fb-maintenance/route.ts"),
      "utf8",
    )
    expect(AUTOMATED_PRODUCTION_WORKER_JOBS).toEqual(["application-expiry", "review-backlog"])
    expect(route).toContain("AUTOMATED_PRODUCTION_WORKER_JOBS")
    expect(route).not.toContain("request.nextUrl")
    expect(route).not.toContain("searchParams")
    expect(route).not.toContain("failed-deletion-retry")
  })
})
