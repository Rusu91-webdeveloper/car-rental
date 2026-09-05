import { PrismaClient } from "@prisma/client"
import { normalizeDatabaseUrl } from "./db-url"

// Normalize database URL before creating PrismaClient
// This ensures CAR_DATABASE_URL is used if DATABASE_URL is not set
normalizeDatabaseUrl()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    // Neon may need several seconds to resume a suspended compute. Keep the
    // booking transaction alive through that cold start, especially in
    // serverless production environments.
    transactionOptions: {
      maxWait: 10_000,
      timeout: 30_000,
    },
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
