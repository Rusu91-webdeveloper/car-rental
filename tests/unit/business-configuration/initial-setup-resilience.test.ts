import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("initial business setup resilience", () => {
  it("seeds confirmation definitions in one idempotent call outside the interactive transaction", () => {
    const initializer = source("lib/business-configuration/initial-setup.ts")

    expect(initializer).toContain("confirmationSectionDefinition.createMany")
    expect(initializer).toContain("skipDuplicates: true")
    expect(initializer).not.toContain("confirmationSectionDefinition.upsert")
    expect(initializer.indexOf("confirmationSectionDefinition.createMany")).toBeLessThan(
      initializer.indexOf("return db.$transaction"),
    )
  })

  it("allows the one-time setup transaction to tolerate production database latency", () => {
    const initializer = source("lib/business-configuration/initial-setup.ts")

    expect(initializer).toContain("maxWait: 10_000")
    expect(initializer).toContain("timeout: 30_000")
  })

  it("does not expose Prisma errors to the admin", () => {
    const action = source("app/actions/business-setup.ts")

    expect(action).toContain('console.error("[START_BUSINESS_SETUP_ERROR]", error)')
    expect(action).toContain('error: "Business setup could not be started. Please try again."')
    expect(action).not.toContain("error.message")
  })
})
