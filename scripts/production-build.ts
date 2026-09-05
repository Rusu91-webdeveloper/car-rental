import { spawnSync } from "node:child_process"
import { getMigrationDatabaseUrl } from "../lib/db-url"

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit",
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// Production code must never be deployed before its additive schema changes.
// Preview and local builds remain read-only against their configured databases.
if (process.env.VERCEL_ENV === "production") {
  run("npm", ["run", "db:deploy"], {
    ...process.env,
    DATABASE_URL: getMigrationDatabaseUrl(),
  })
}

run("next", ["build"])
