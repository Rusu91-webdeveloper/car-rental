import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("admin dashboard database freshness", () => {
  it("loads dashboard collections directly from Prisma on every request", () => {
    const page = source("app/[locale]/admin/page.tsx")

    expect(page).toContain('export const dynamic = "force-dynamic"')
    expect(page).toContain("prisma.car.findMany")
    expect(page).toContain("where: { isDeleted: false }")
    expect(page).toContain("prisma.user.findMany")
  })

  it("remounts client state when a fresh server snapshot arrives", () => {
    const page = source("app/[locale]/admin/page.tsx")
    const dashboard = source("app/[locale]/admin/admin-client.tsx")

    expect(page).toContain('key={`${initialSection}:${generatedAt}`}')
    expect(dashboard).toContain("router.refresh()")
    expect(dashboard).toContain("Refresh data")
  })

  it("uses business definitions for active cars and customer accounts", () => {
    const dashboard = source("app/[locale]/admin/admin-client.tsx")

    expect(dashboard).toContain("carsState.length")
    expect(dashboard).toContain('usersState.filter((user) => user.role === "USER").length')
  })
})
