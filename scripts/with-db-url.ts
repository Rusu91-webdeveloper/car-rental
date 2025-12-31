#!/usr/bin/env tsx
/**
 * Wrapper script that normalizes the database URL environment variable
 * before running Prisma commands. This ensures CAR_DATABASE_URL is used
 * if DATABASE_URL is not set.
 */

import { normalizeDatabaseUrl } from "../lib/db-url"
import { execSync } from "child_process"

// Normalize the database URL
normalizeDatabaseUrl()

// Get the command to run (everything after this script name)
const args = process.argv.slice(2)

if (args.length === 0) {
  console.error("Error: No command provided")
  console.error("Usage: tsx scripts/with-db-url.ts <command> [args...]")
  process.exit(1)
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

