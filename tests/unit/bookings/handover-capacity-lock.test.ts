import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("handover capacity transaction lock", () => {
  it("executes the PostgreSQL void-returning advisory lock without deserializing it", () => {
    for (const path of [
      "lib/booking-applications/infrastructure/prisma-repository.ts",
      "app/actions/admin.ts",
    ]) {
      const source = read(path)
      expect(source).toContain("$executeRaw`SELECT pg_advisory_xact_lock(2026072821)`")
      expect(source).not.toContain("$queryRaw`SELECT pg_advisory_xact_lock(2026072821)`")
    }
  })
})
