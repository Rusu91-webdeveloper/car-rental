interface DatabaseUrlEnvironment {
  [key: string]: string | undefined
  DATABASE_URL?: string
  CAR_DATABASE_URL?: string
  DIRECT_URL?: string
}

/**
 * Resolves the database URL from environment variables.
 * Prefers DATABASE_URL, falls back to CAR_DATABASE_URL.
 * This allows overrides via DATABASE_URL while keeping Neon defaults.
 */
export function getDatabaseUrl(environment: DatabaseUrlEnvironment = process.env): string {
  const carDbUrl = environment.CAR_DATABASE_URL
  const dbUrl = environment.DATABASE_URL

  if (dbUrl) {
    return dbUrl
  }

  if (carDbUrl) {
    return carDbUrl
  }

  throw new Error(
    "Database URL not found. Please set either CAR_DATABASE_URL or DATABASE_URL environment variable."
  )
}

/**
 * Resolves an unpooled URL for schema migrations. Prisma Migrate uses a
 * session-level advisory lock, which is unsafe through a transaction/session
 * pooler because the lock can remain attached to a reused backend connection.
 */
export function getMigrationDatabaseUrl(environment: DatabaseUrlEnvironment = process.env): string {
  if (environment.DIRECT_URL) return environment.DIRECT_URL

  const runtimeUrl = new URL(getDatabaseUrl(environment))
  if (runtimeUrl.hostname.endsWith(".neon.tech") && runtimeUrl.hostname.includes("-pooler.")) {
    runtimeUrl.hostname = runtimeUrl.hostname.replace("-pooler.", ".")
    runtimeUrl.searchParams.delete("pgbouncer")
    runtimeUrl.searchParams.delete("connection_limit")
    runtimeUrl.searchParams.delete("pool_timeout")
  }
  return runtimeUrl.toString()
}

/**
 * Normalizes the database URL environment variable.
 * Sets DATABASE_URL from CAR_DATABASE_URL if it exists and DATABASE_URL doesn't.
 * This ensures Prisma can always find DATABASE_URL.
 */
export function normalizeDatabaseUrl(): void {
  if (!process.env.DATABASE_URL && process.env.CAR_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.CAR_DATABASE_URL
  }
}
