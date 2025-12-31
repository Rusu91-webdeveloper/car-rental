/**
 * Resolves the database URL from environment variables.
 * Checks CAR_DATABASE_URL first, then falls back to DATABASE_URL.
 * This allows production to use CAR_DATABASE_URL while maintaining
 * backward compatibility with DATABASE_URL.
 */
export function getDatabaseUrl(): string {
  const carDbUrl = process.env.CAR_DATABASE_URL
  const dbUrl = process.env.DATABASE_URL

  if (carDbUrl) {
    return carDbUrl
  }

  if (dbUrl) {
    return dbUrl
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

