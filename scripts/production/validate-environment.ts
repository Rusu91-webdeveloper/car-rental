import { PRODUCTION_WORKER_JOBS, readProductionOperationsEnvironment } from "../../lib/production/operations-environment"

const issues = new Set<string>()
const env = process.env

function requireValue(key: string) {
  if (!env[key]?.trim()) issues.add(`MISSING_${key}`)
}

for (const key of [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ADMIN_EMAILS",
  "RATE_LIMIT_HASH_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "NEXTAUTH_URL",
  "GMAIL_SMTP_USER",
  "GMAIL_SMTP_APP_PASSWORD",
  "EMAIL_FROM",
  "PRIVATE_DOCUMENT_BLOB_STORE_ID",
  "BLOB_STORE_ID",
  "VERCEL_OIDC_TOKEN",
  "PHASE8FB_WORKER_SECRET",
  "CRON_SECRET",
  "PRODUCTION_OWNER",
  "PRODUCTION_ALERT_OWNER",
  "PRODUCTION_ALERT_RECIPIENT",
  "DATABASE_RECOVERY_OWNER",
  "WORKER_MAINTENANCE_OWNER",
]) requireValue(key)

if (env.NODE_ENV !== "production") issues.add("NODE_ENV_NOT_PRODUCTION")
for (const key of ["NEXT_PUBLIC_APP_URL", "NEXTAUTH_URL"])
  if (env[key] && !env[key]!.startsWith("https://")) issues.add(`${key}_NOT_HTTPS`)
if (env.NEXT_PUBLIC_APP_URL && env.NEXTAUTH_URL && env.NEXT_PUBLIC_APP_URL !== env.NEXTAUTH_URL)
  issues.add("APPLICATION_ORIGIN_MISMATCH")
if (env.DATABASE_URL && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) issues.add("DATABASE_URL_NOT_POSTGRESQL")
if ((env.NEXTAUTH_SECRET?.length ?? 0) < 32) issues.add("NEXTAUTH_SECRET_TOO_SHORT")
if ((env.RATE_LIMIT_HASH_SECRET?.length ?? 0) < 32) issues.add("RATE_LIMIT_HASH_SECRET_TOO_SHORT")
if ((env.PHASE8FB_WORKER_SECRET?.length ?? 0) < 32) issues.add("PHASE8FB_WORKER_SECRET_TOO_SHORT")
if ((env.CRON_SECRET?.length ?? 0) < 32) issues.add("CRON_SECRET_TOO_SHORT")
if (env.GMAIL_SMTP_USER && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.GMAIL_SMTP_USER))
  issues.add("GMAIL_SMTP_USER_INVALID")
if (env.GMAIL_SMTP_APP_PASSWORD && env.GMAIL_SMTP_APP_PASSWORD.replace(/\s+/g, "").length !== 16)
  issues.add("GMAIL_SMTP_APP_PASSWORD_INVALID")
if (env.EMAIL_FROM && (!env.EMAIL_FROM.includes("@") || env.EMAIL_FROM.includes("noreply@rentcar.com")))
  issues.add("EMAIL_FROM_INVALID_OR_DEFAULT")

if (env.PRIVATE_DOCUMENTS_ENABLED !== "true") issues.add("PRIVATE_DOCUMENTS_DISABLED")
if (env.PRIVATE_DOCUMENT_STORAGE_PROVIDER !== "vercel-blob-private") issues.add("PRIVATE_DOCUMENT_PROVIDER_INVALID")
if (env.PRIVATE_DOCUMENT_ENVIRONMENT !== "production") issues.add("PRIVATE_DOCUMENT_ENVIRONMENT_INVALID")
if (env.PRIVATE_DOCUMENT_BLOB_STORE_ID !== env.BLOB_STORE_ID) issues.add("PRIVATE_DOCUMENT_BLOB_STORE_MISMATCH")
if (env.PRIVATE_DOCUMENT_BLOB_REGION !== "fra1") issues.add("PRIVATE_DOCUMENT_BLOB_REGION_INVALID")
if (env.PRIVATE_DOCUMENT_BLOB_PRIVATE_ACCESS_ATTESTED !== "true") issues.add("PRIVATE_DOCUMENT_PRIVATE_ACCESS_UNATTESTED")
if (env.PRIVATE_DOCUMENT_BLOB_REGION_ATTESTED !== "true") issues.add("PRIVATE_DOCUMENT_REGION_UNATTESTED")
if (env.BLOB_READ_WRITE_TOKEN) issues.add("PRODUCTION_STATIC_BLOB_TOKEN_FORBIDDEN")

const secretValues = [
  env.NEXTAUTH_SECRET,
  env.RATE_LIMIT_HASH_SECRET,
  env.PHASE8FB_WORKER_SECRET,
  env.CRON_SECRET,
].filter((value): value is string => Boolean(value))
if (new Set(secretValues).size !== secretValues.length) issues.add("OPERATIONAL_SECRETS_NOT_DISTINCT")

const operations = readProductionOperationsEnvironment(env)
if (!operations.alertingConfigured) issues.add("PRODUCTION_ALERTING_NOT_CONFIGURED")
if (!operations.allOwnersAssigned) issues.add("OPERATIONAL_OWNERSHIP_INCOMPLETE")
if (operations.legacyAlertAttestation) issues.add("LEGACY_ALERT_ATTESTATION_MUST_REMAIN_FALSE")
if (env.PHASE8FB_WORKERS_ENABLED !== "true") issues.add("PHASE8FB_WORKERS_DISABLED")
if (!operations.allWorkerJobsEnabled) issues.add("PHASE8FB_WORKER_ROLLOUT_INCOMPLETE")
if (env.BOOKING_MAINTENANCE_WORKER_ENABLED !== "true") issues.add("BOOKING_MAINTENANCE_WORKER_DISABLED")

for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"])
  if (env[key]) issues.add(`ONLINE_PAYMENT_VARIABLE_FORBIDDEN_${key}`)
for (const key of ["EMAIL_USER", "EMAIL_PASS", "RESEND_API_KEY", "RESEND_FROM_EMAIL"])
  if (env[key]) issues.add(`OBSOLETE_EMAIL_VARIABLE_FORBIDDEN_${key}`)

const result = {
  ready: issues.size === 0,
  issueCodes: [...issues].sort(),
  requiredWorkerJobs: PRODUCTION_WORKER_JOBS,
  durableEvidenceRequired: [
    "successful alert-delivery test within 30 days",
    "successful backup verification within 24 hours",
    "successful restore rehearsal within 90 days",
    "successful scheduled-worker heartbeats within 48 hours",
  ],
}
console.log(JSON.stringify(result, null, 2))
if (!result.ready) process.exitCode = 1
