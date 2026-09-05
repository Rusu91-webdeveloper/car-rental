#!/usr/bin/env tsx
/**
 * Wrapper script that normalizes the database URL environment variable
 * before running Prisma commands. This ensures CAR_DATABASE_URL is used
 * if DATABASE_URL is not set.
 */

import { getMigrationDatabaseUrl, normalizeDatabaseUrl } from "../lib/db-url"
import { execSync } from "child_process"
import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"

// Standalone scripts do not get Next.js environment loading automatically.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) loadEnvFile(file)
}
// Normalize the database URL
normalizeDatabaseUrl()

// Get the command to run (everything after this script name)
const args = process.argv.slice(2)

if (args.length === 0) {
  console.error("Error: No command provided")
  console.error("Usage: tsx scripts/with-db-url.ts <command> [args...]")
  process.exit(1)
}

// Prisma Migrate uses a session-level advisory lock. Running it through
// Neon pooling can leave that lock attached to a reused backend connection,
// blocking later production deployments even after the command exits.
if (args[0] === "prisma" && args[1] === "migrate") {
  process.env.DATABASE_URL = getMigrationDatabaseUrl()
}

// Execute the command
const command = args.join(" ")

try {
  execSync(command, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  })
} catch (error) {
  process.exit(1)
}
