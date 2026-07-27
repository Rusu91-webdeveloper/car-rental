import "server-only"

import { getServerVerifiedGoogleAuthenticationEvidence, requireAdmin } from "@/lib/auth"
import {
  requireRecentAuthentication,
  ServerSessionRecentAuthenticationVerifier,
} from "@/lib/private-documents/authorization/recent-auth"

const DEFAULT_RECENT_AUTH_MAXIMUM_AGE_MS = 10 * 60_000

function configuredDeveloperEmails(env: NodeJS.ProcessEnv = process.env) {
  return (env.MAINTENANCE_DEVELOPER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isMaintenanceDeveloperEmail(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!email) return false
  return configuredDeveloperEmails(env).includes(email.trim().toLowerCase())
}

export async function requireMaintenanceDeveloper() {
  const user = await requireAdmin()
  if (!isMaintenanceDeveloperEmail(user.email))
    throw new Error("Forbidden: Developer maintenance access required")
  return user
}

export async function requireRecentMaintenanceDeveloper() {
  const user = await requireMaintenanceDeveloper()
  const authentication = await getServerVerifiedGoogleAuthenticationEvidence()
  if (!authentication || authentication.userId !== user.id)
    throw new Error("Recent Google authentication is required")
  await requireRecentAuthentication(new ServerSessionRecentAuthenticationVerifier(), {
    userId: user.id,
    evidence: authentication.evidence,
    maximumAgeMs: DEFAULT_RECENT_AUTH_MAXIMUM_AGE_MS,
  })
  return { user, evidence: authentication.evidence }
}
