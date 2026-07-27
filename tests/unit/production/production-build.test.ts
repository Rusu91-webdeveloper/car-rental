import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("production build database safety", () => {
  it("deploys pending migrations before a production Next.js build", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/production-build.ts"), "utf8")

    expect(script).toContain('process.env.VERCEL_ENV === "production"')
    expect(script).toContain('run("npm", ["run", "db:deploy"])')
    expect(script).toContain('run("next", ["build"])')
  })
})
