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
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
