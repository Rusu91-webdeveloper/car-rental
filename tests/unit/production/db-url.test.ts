import { describe, expect, it } from "vitest"
import { getDatabaseUrl, getMigrationDatabaseUrl } from "@/lib/db-url"

describe("database URL resolution", () => {
  it("keeps the pooled URL for application runtime", () => {
    const environment = {
      CAR_DATABASE_URL:
        "postgresql://user:secret@ep-example-pooler.eu-central-1.aws.neon.tech/app?sslmode=require",
    }

    expect(getDatabaseUrl(environment)).toBe(environment.CAR_DATABASE_URL)
  })

  it("prefers an explicitly configured direct migration URL", () => {
    const environment = {
      DATABASE_URL: "postgresql://user:secret@runtime.example/app",
      DIRECT_URL: "postgresql://migration:secret@direct.example/app",
    }

    expect(getMigrationDatabaseUrl(environment)).toBe(environment.DIRECT_URL)
  })

  it("derives the direct Neon endpoint and removes pool-only parameters", () => {
    const migrationUrl = new URL(
      getMigrationDatabaseUrl({
        DATABASE_URL:
          "postgresql://user:secret@ep-example-pooler.eu-central-1.aws.neon.tech/app?sslmode=require&pgbouncer=true&connection_limit=1&pool_timeout=10",
      }),
    )

    expect(migrationUrl.hostname).toBe("ep-example.eu-central-1.aws.neon.tech")
    expect(migrationUrl.searchParams.get("sslmode")).toBe("require")
    expect(migrationUrl.searchParams.has("pgbouncer")).toBe(false)
    expect(migrationUrl.searchParams.has("connection_limit")).toBe(false)
    expect(migrationUrl.searchParams.has("pool_timeout")).toBe(false)
  })

  it("preserves non-Neon database URLs", () => {
    const value = "postgresql://user:secret@database.example.com/app?sslmode=require"
    expect(getMigrationDatabaseUrl({ DATABASE_URL: value })).toBe(value)
  })
})
