/**
 * Resolves the database URL from environment variables.
 * Prefers DATABASE_URL, falls back to CAR_DATABASE_URL.
 * This allows overrides via DATABASE_URL while keeping Neon defaults.
 */
export function getDatabaseUrl(): string {
  const carDbUrl = process.env.CAR_DATABASE_URL
  const dbUrl = process.env.DATABASE_URL

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
 * Normalizes the database URL environment variable.
 * Sets DATABASE_URL from CAR_DATABASE_URL if it exists and DATABASE_URL doesn't.
 * This ensures Prisma can always find DATABASE_URL.
 */
export function normalizeDatabaseUrl(): void {
  if (!process.env.DATABASE_URL && process.env.CAR_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.CAR_DATABASE_URL
  }
}
