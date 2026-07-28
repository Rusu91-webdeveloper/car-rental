# Environment-variable setup guide

Repository: `car-rental-app`
Branch reviewed: `release/production-v1`
Application release: `89c4e99`
Runbook baseline: `92d0838`
Review date: 2026-07-15

This is a name-and-policy guide. It contains placeholders only. It does not authorize a deployment, create provider resources, change application behavior, or replace the production go/no-go process in [27-production-operations.md](./27-production-operations.md) and [28-production-deployment-and-go-live.md](./28-production-deployment-and-go-live.md).

## 1. Security warning

> **Never put a real password, API key, OAuth secret, database URL, OIDC token, worker secret, Cron secret, customer address, or private Blob identifier in this document, a ticket, chat, terminal transcript, screenshot, commit, or build log.** Use provider dashboards or Vercel's encrypted environment-variable UI. Compare secrets only by presence, scope, length/prefix rules, or a one-way fingerprint approved for the runbook.

- Every variable marked **secret** must be stored server-side. A `NEXT_PUBLIC_` value is compiled into browser-visible code and can never contain a secret.
- Development, Preview, and Production must have separate secret values and provider resources unless a row explicitly says that the same non-secret value is safe.
- **The previously exposed Neon password must be rotated before any other setup.** Treat every connection string containing that password as compromised, replace it in every authorized store, invalidate the old credential, and redeploy affected scopes. Do not reproduce either password here.
- **Preview must never use the Production Neon branch, database URL, role credential, or restore target.** Prefer an isolated Neon child branch and separate role/password. Verify branch identity without printing the URL.
- **Production and non-production Blob stores must remain separate.** A Preview project/store name must identify non-production; Production must use its own private `fra1` store. Never copy Production `BLOB_STORE_ID` or Blob access material into Preview.
- `BLOB_READ_WRITE_TOKEN` is forbidden in Production by the repository. Production Blob access is OIDC-only.
- Changing a Vercel environment variable does not alter an existing immutable deployment. Redeploy the intended scope and verify the resulting deployment before considering the change active.

## 2. Complete environment-variable inventory

### Reading the tables

Scope cells use: **R** required, **O** optional, **C** conditionally required for the named feature/operation, **A** automatically supplied by Next.js/Vercel, **F** forbidden, and **—** unused. `L`, `V`, `P`, and `I` mean Local Development, Vercel Preview, Vercel Production, and Integration/operator tests. “Block” uses **B** build/install, **R** runtime/feature, **H** production health/preflight, **T** test/script, and **—** no direct block. “Deploy” means a Vercel redeployment is required after a manual value change; local changes require a process restart unless the row is script-only.

The requirement count used in this guide is intentionally precise:

- **68** unique names are referenced by executable application, test, configuration, Prisma, preflight, or shell code.
- **31** are required for the fully enabled Production state measured by current preflight/health; 27 are operator-configured, `NODE_ENV`, `VERCEL`, and `VERCEL_OIDC_TOKEN` are platform-supplied, and `BLOB_STORE_ID` is supplied by the approved Blob integration but remains a required binding.
- **9** are baseline Preview requirements (`DATABASE_URL`, the two application URLs, Auth.js/Google's three values, `ADMIN_EMAILS`, `RATE_LIMIT_HASH_SECRET`, plus platform `NODE_ENV`). `VERCEL` is also automatically present. A document-enabled Preview adds the ten document/Blob binding values listed in the Preview matrix; the synthetic provider harness adds four explicit guard values.
- **34** executable-code names are optional, conditional, test/operator-only, or compatibility values rather than fully enabled Production requirements.
- **7** names are deprecated/forbidden: three Stripe names enforced by preflight and four historical SMTP names found only in stale documentation.
- The safe template also includes `DIRECT_URL`, now consumed only by the production migration build path. The guide therefore covers 72 names: 68 executable-code names and four historical SMTP names.

### 2.1 Core application

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | Required; no | R / A / A / A | `development`, `test`, or `production`; Next.js/Vercel supplies deployed value. Local template defaults to `development`. | `next.config.mjs`, logging, config, private-document guards, local storage, rate limiting. Wrong Production value fails preflight and changes security/runtime behavior. **R/H/T** | Platform-managed; redeploy to change runtime |
| `NEXT_PUBLIC_APP_URL` | Required; public | R / R / R / C | Absolute origin; `http://localhost:3000` locally, exact `https://` origin in V/P; Vercel/custom domain. Config falls back to `NEXTAUTH_URL`, then localhost, but preflight permits no fallback. | `lib/config.ts`, `lib/email.tsx`, preflight. Generates application/email links; missing/wrong value can generate wrong links and fails Production preflight. **R/H** | Yes; browser/build-visible |
| `NEXTAUTH_URL` | Required; no | R / R / R / C | Exact absolute Auth.js origin; HTTPS in V/P; must equal `NEXT_PUBLIC_APP_URL` in Production. | `lib/config.ts`, preflight; Auth.js base-origin convention. Mismatch fails preflight and causes OAuth callback/session failures. **R/H** | Yes |
| `ADMIN_EMAILS` | Required in V/P; restricted identity, not an authentication secret | O / R / R / C | Comma-separated valid email addresses; no default in Production. Client/operator supplies approved admin identities. | `lib/config.ts`, preflight. Matching Google users become legacy `ADMIN`; empty Production list leaves no automatic admin and fails preflight. **R/H** | Yes |
| `ADMIN_EMAIL` | Compatibility; restricted identity | O / O / O / — | One valid email; no default. Used only when canonical lists/targets are absent. | `lib/config.ts`, `lib/email.tsx`, `lib/business-info.ts`. Legacy admin/support fallback; omission is safe when canonical values exist. **R** only for dependent mail/content | Yes |
| `SUPPORT_EMAIL` | Optional; restricted identity | O / O / O / — | Valid support mailbox; falls back to `ADMIN_EMAIL`, then empty. | `lib/email.tsx`, `lib/business-info.ts`. Controls support contact content; missing value can omit/fallback contact. **R** | Yes |

### 2.2 Neon/PostgreSQL and Prisma

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Required; **secret** | R / R / R / C | PostgreSQL URI beginning `postgres://` or `postgresql://`; pooled Neon runtime URL recommended. No default. Obtain from the exact Neon branch/role/database. | `prisma/schema.prisma`, `lib/db-url.ts`, `next.config.mjs`, Prisma client and preflight. Missing/wrong URL breaks database runtime, migrations, health and usually build/install paths; non-Postgres fails preflight. **B/R/H/T** | Yes |
| `CAR_DATABASE_URL` | Compatibility; **secret** | O / O / O / C | PostgreSQL URI; no default. Used only when `DATABASE_URL` is absent and normalized into it. | `lib/db-url.ts`, `next.config.mjs`, `scripts/with-db-url.ts`. Can support old environments, but Production preflight still requires canonical `DATABASE_URL`. **B/R/T** | Yes |
| `DIRECT_URL` | Optional migration override; **secret** | O / O / O / C | Direct/unpooled Neon PostgreSQL URI, normally a hostname without `-pooler`; no default. Obtain from the same exact branch/role/database as runtime. | `scripts/production-build.ts` prefers it for `prisma migrate deploy`; when omitted, Neon pooled hostnames are converted to their direct equivalent. It is never used by application runtime queries. **B/T** | Yes when changing the deployed migration endpoint |

`DIRECT_URL` must never point at a different branch than its paired `DATABASE_URL`. It is optional on Vercel because the production build derives the direct Neon hostname from a pooled runtime URL when possible.

### 2.3 Auth.js

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `NEXTAUTH_SECRET` | Required; **secret** | C / R / R / C | High-entropy random string; Production preflight requires at least 32 characters. Distinct per environment and from every operational secret. | `lib/auth.ts`, `lib/auth-edge.ts`, `lib/config.ts`, `lib/rate-limit.ts`, preflight. Missing disables edge auth fallback, invalidates sessions/auth and fails preflight. **R/H** | Yes; existing sessions may be invalidated |

Auth.js callback routing is implemented by `app/api/auth/[...nextauth]/route.ts`; the Google callback path is `/api/auth/callback/google`.

### 2.4 Google OAuth

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Required for auth; identifier | C / R / R / C | Google OAuth 2.0 Web application client ID; exact environment-approved client. No default. | `lib/auth.ts`, `lib/auth-edge.ts`, `lib/config.ts`, preflight. Missing disables configured auth or causes provider failure and fails Production preflight. **R/H** | Yes |
| `GOOGLE_CLIENT_SECRET` | Required for auth; **secret** | C / R / R / C | Google OAuth client secret; no default; separate client is preferred for non-production. | Same consumers as client ID. Missing disables/fails Google sign-in and fails preflight. **R/H** | Yes |

### 2.5 Resend

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | Required in Production; **secret** | O / C / R / C | Resend API key beginning `re_`; use environment/account-appropriate sending permission. No default. | `lib/email.tsx`, `lib/config.ts`, preflight and unit tests. Missing makes email provider `None`, sends return safe errors, health fails, preflight fails. **R/H/T** | Yes |
| `EMAIL_FROM` | Required in Production; public/restricted sender | O / C / R / C | Valid mailbox or `Display Name <mailbox>` on verified Resend domain. Must contain `@`; default `RentCar <noreply@rentcar.com>` is explicitly rejected by preflight. | `lib/email.tsx`, preflight. Canonical From address; invalid/unverified values fail delivery/preflight. **R/H/T** | Yes |
| `RESEND_FROM_EMAIL` | Compatibility alias; public/restricted sender | O / O / O / C | Same format as `EMAIL_FROM`; no default. Used only if `EMAIL_FROM` is absent. | `lib/email.tsx`. Can prevent local fallback, but cannot satisfy Production preflight because canonical `EMAIL_FROM` remains required. **R** | Yes |

There is no environment variable for an approved test recipient. Recipients come from booking/application data. Use only a pre-approved synthetic recipient in Preview/manual verification.

### 2.6 Vercel Blob private documents

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `PRIVATE_DOCUMENT_STORAGE_PROVIDER` | Required when documents enabled | O / C / R / R | `local-private` or `vercel-blob-private`; any missing/invalid value resolves to local and records an issue. V/P must use `vercel-blob-private`. | `lib/private-documents/infrastructure/environment.ts`, storage factory, preflight, provider harness. Local provider in deployed Production fails closed/health. **R/H/T** | Yes |
| `PRIVATE_DOCUMENT_BLOB_STORE_ID` | Required for Blob; identifier | — / C / R / R | Expected store ID copied by identifier only from approved store; must exactly equal `BLOB_STORE_ID`. No default. | Document environment, non-production guard, preflight. Missing/mismatch blocks provider and health. **R/H/T** | Yes |
| `BLOB_STORE_ID` | Required for Blob; identifier | — / C/A / R/A / R/A | Actual store ID supplied when the correct Vercel Blob store is connected. No application default. | Same guards plus Blob SDK environment. Missing/mismatch blocks provider/preflight. **R/H/T** | Reconnect/redeploy; integration-managed |
| `PRIVATE_DOCUMENT_BLOB_REGION` | Required for Blob; no | — / C / R / R | Exactly `fra1` in current code; defaults to `fra1` at runtime, but Production preflight requires explicit value. | Document environment, integration guard, preflight. Other values fail. **R/H/T** | Yes |
| `PRIVATE_DOCUMENT_BLOB_PRIVATE_ACCESS_ATTESTED` | Required evidence; no | — / C / R / R | `true` only after private-access/unauthenticated-denial verification; otherwise false/absent. | Document environment, integration guard, preflight. False/missing blocks readiness. **H/T** | Yes |
| `PRIVATE_DOCUMENT_BLOB_REGION_ATTESTED` | Required evidence; no | — / C / R / R | `true` only after `fra1` verification; otherwise false/absent. | Same consumers. False/missing blocks readiness. **H/T** | Yes |
| `VERCEL` | Platform runtime marker; no | — / A / A / A | Truthy value automatically supplied by Vercel. Do not invent locally as production evidence. | Document environment. Missing in a `NODE_ENV=production` document runtime records `DOCUMENT_VERCEL_RUNTIME_UNAVAILABLE` and fails health. **H** | Platform-managed |
| `VERCEL_ENV` | Platform environment marker; no | — / A (`preview`) / A (`production`) / A/C | `development`, `preview`, or `production`, supplied by Vercel. | `lib/private-documents/infrastructure/nonproduction-integration.ts`. A Production value hard-rejects the synthetic non-production harness. **T** | Platform-managed |
| `VERCEL_OIDC_TOKEN` | Required for Blob; **ephemeral secret** | C / A / A / A/C | Short-lived JWT supplied/refreshed by Vercel; local `vercel env pull` may obtain a temporary token. Never copy a Production token. | Document environment, integration guard, `@vercel/blob`, preflight. Missing/expired/wrong project or environment blocks Blob and health. **R/H/T** | Platform-managed; re-pull locally when expired |
| `BLOB_READ_WRITE_TOKEN` | Legacy static token; **secret** | O / F / **F** / F | Static Blob token if legacy local tooling absolutely requires it. No default. Current production and integration guards require absence. | Document environment, integration guard, preflight, Blob SDK convention. Presence in Production fails preflight; remove it. **H/T** | Redeploy after removal |

### 2.7 Booking applications and document features

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `PRIVATE_DOCUMENTS_ENABLED` | Feature gate; no | O / C / R / C | Exact `true` enables; anything else disables. Template default `false`. | Document environment, preflight, application/document routes. Production preflight requires enabled final state; keep false during dark setup. **R/H** | Yes |
| `PRIVATE_DOCUMENT_REVIEW_MODE` | Optional with required Production outcome; no | O / C / O / C | `manual` or `scanner`; missing/other defaults to `manual`. Production must remain manual. | Document environment. `scanner` fails Production document configuration. **R/H** | Yes |
| `PRIVATE_DOCUMENT_SCANNER_ENABLED` | Optional with required Production outcome; no | O / C / O / C | `true` or `false`; missing defaults false. Must be false in Production. | Document environment. True in Production records scanner-path failure; fake scanner is not approved. **R/H** | Yes |
| `PRIVATE_DOCUMENT_ENVIRONMENT` | Required for deployed documents; no | O / C / R / R | Slug matching `^[a-z0-9][a-z0-9-]{0,31}$`; runtime fallback `local`, but Production preflight requires exact `production`. Use a distinct non-production slug in Preview. | Document environment/path namespace, integration guard, preflight. Invalid value blocks documents. **R/H/T** | Yes |
| `PRIVATE_DOCUMENT_LOCAL_ROOT` | Local only; sensitive filesystem path, not credential | O / F / F / O | Absolute private local/disposable path; default `/tmp/car-rental-private-documents`. | Lifecycle/request context, local storage, worker/deletion route. Local adapter rejects Production. **R/T** | Local restart only |
| `PRIVATE_DOCUMENT_MAXIMUM_UPLOAD_BYTES` | Optional policy; no | O / O / O / O | Positive safe integer no greater than `10485760`; default is hard policy 10 MiB. | Document environment and upload flows. Invalid/oversize records config issue and blocks document readiness. **R/H/T** | Yes |
| `PRIVATE_DOCUMENT_UPLOAD_GRANT_SECONDS` | Optional policy; no | O / O / O / O | Positive safe integer `<=600`; default `600`. | Document environment/upload grant. Invalid/long value records issue. **R/H/T** | Yes |

BookingApplication workflow behavior is otherwise database/release configured. There is no `BOOKING_APPLICATION_*` environment variable and `BOOKING_PAYMENT_WINDOW_HOURS` is a code constant, not an environment variable.

### 2.8 Recent authentication

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `PRIVATE_DOCUMENT_RECENT_AUTH_SECONDS` | Optional policy; no | O / O / O / O | Positive safe integer `<=600`; default `600`. | Document environment/request context and review, download, role, hold, deletion services. Invalid/long window records a health issue; expired/missing Google evidence denies sensitive action. **R/H/T** | Yes |

Recent-auth evidence is generated server-side from a successful Google OAuth callback in `lib/auth.ts`; there is no browser-supplied timestamp variable.

### 2.9 Restricted roles

There are **no restricted-role environment variables**. `pnpm documents:roles:bootstrap` creates/updates role and capability vocabulary only and explicitly assigns no users. Production health queries the database and requires at least one assignment for each of `DOCUMENT_REVIEWER`, `DOCUMENT_SECURITY_ADMIN`, and `DOCUMENT_RETENTION_OPERATOR`. Assignments are audited database state made through the authorized UI/workflow after recent Google authentication; setting `ADMIN_EMAILS` does not satisfy this check.

### 2.10 Workers and Vercel Cron

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `PHASE8FB_WORKERS_ENABLED` | Master gate; no | O / O / R / C | Exact `true`; anything else disabled. Start false. | Internal worker route, production health, preflight. False returns 403 and final preflight fails. **R/H/T** | Yes |
| `PHASE8FB_WORKER_JOBS_ENABLED` | Allowlist; no | O / O / R / C | Comma-separated subset of exact job names below; unknown names are ignored. Start empty. | `lib/production/operations-environment.ts`, worker route, health, preflight. Missing/incomplete denies jobs and final health/preflight. **R/H/T** | Yes |
| `PHASE8FB_WORKER_SECRET` | Required for worker execution; **secret** | O / O / R / C | Distinct high-entropy bearer secret, at least 32 characters in preflight. | Internal worker route and preflight. Missing/wrong token returns 403; short/reused secret fails preflight. **R/H/T** | Yes; update scheduler atomically |
| `BOOKING_MAINTENANCE_WORKER_ENABLED` | Booking Cron gate; no | O / O / R / C | Exact `true`; anything else disabled. Start false. | `app/api/cron/cancel-expired-bookings/route.ts`, preflight. False denies route/fails final preflight. **R/H/T** | Yes |
| `CRON_SECRET` | Required for booking Cron; **secret** | O / O / R / C | Distinct high-entropy bearer secret, at least 32 characters. | Booking Cron route and preflight. Missing/wrong returns 401; short/reused fails preflight. **R/H/T** | Yes; update scheduler atomically |

Allowed `PHASE8FB_WORKER_JOBS_ENABLED` values, in approved staged order: `review-backlog`, `stale-review`, `application-expiry`, `abandoned-upload-cleanup`, `retention-processing`, `orphan-reconciliation`, `deletion-processing`, `failed-deletion-retry`.

The repository contains worker endpoints but no Vercel schedule definition. Scheduler creation remains an external, separately approved operation.

### 2.11 Rate limiting

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `RATE_LIMIT_HASH_SECRET` | Required V/P; **secret** | O / R / R / C | Distinct random string; Production preflight requires at least 32 characters. No Production fallback; runtime code can fall back to `NEXTAUTH_SECRET`, but preflight requires the canonical value and distinct secrets. | `lib/rate-limit.ts`, preflight. HMACs rate-limit subjects; missing in Production can throw, short/reused fails preflight. **R/H/T** | Yes |

### 2.12 Retention and deletion

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `PRIVATE_DOCUMENT_RECONCILIATION_BATCH_SIZE` | Optional policy; no | O / O / O / O | Positive safe integer `<=100`; default `50`. | Document environment and orphan-reconciliation worker. Invalid/oversize records issue; missing uses default. **R/H/T** | Yes |

Retention periods are code policy, not environment values: default 90 days, hard maximum 365 days, deletion grace 7 days in `lib/private-documents/retention/calculator.ts`. Legal holds and per-record retention evidence live in PostgreSQL. Do not invent retention environment variables.

### 2.13 Health checks

There is no health-only secret or endpoint environment variable. Public `GET /api/health` checks PostgreSQL and returns `200 {"status":"healthy"}` or 503. The protected localized admin dashboard at `/{locale}/admin/health` aggregates database, active configuration/pricing/legal release, Blob/OIDC, alerts, recovery, worker heartbeats, restricted-role assignments, review queue, retention, audit, and Resend configuration. It reuses the variables in this inventory and also queries database evidence; passing preflight alone does not guarantee dashboard readiness.

### 2.14 Backup and restore

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_RECOVERY_OWNER` | Required Production evidence; restricted identity | — / — / R / C | Non-empty approved owner identifier; no enforced syntax. | Operations environment, health, preflight. Missing blocks backup and restore readiness. **H** | Yes |
| `DATABASE_BACKUP_VERIFIED_AT` | Required Production evidence; no | — / — / R / C | Parseable ISO-8601 timestamp, not future, no older than 24 hours. | Operations environment, health, preflight. Missing/stale/future blocks backup readiness. **H** | Yes |
| `DATABASE_RESTORE_VERIFIED_AT` | Required Production evidence; no | — / — / R / C | Parseable ISO-8601 timestamp, not future, no older than 90 days. | Operations environment, health, preflight. Missing/stale/future blocks restore readiness. **H** | Yes |
| `PRODUCTION_RESTORE_REHEARSAL_CONFIRMED` | Restore-script guard; no | — / — / — / R | Exact literal `synthetic-only`; no default. | `scripts/production/verify-postgres-restore.sh`. Any other/missing value exits 2 before DB access. **T** | No; operator session only |
| `SOURCE_DATABASE_URL` | Restore-script input; **secret** | — / — / — / R | PostgreSQL direct URL for approved source; must not equal restore identity. | Restore verifier uses `psql`/`pg_dump`. Missing exits; source is read/dumped, never reset. **T** | No |
| `RESTORE_DATABASE_URL` | Restore-script input; **secret** | — / — / — / R | Direct URL for a different empty isolated target. | Restore verifier refuses same identity or non-empty public schema; missing exits. **T** | No |
| `TMPDIR` | System optional; path | O / A / A / O | Writable temporary directory; defaults to `/tmp`. | Restore verifier archive location. Invalid/unwritable path fails the script. **T** | No |

### 2.15 Monitoring and external alerts

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `PRODUCTION_ALERTING_ATTESTED` | Required Production evidence; no | — / — / R / C | Exact `true` only after an end-to-end alert-delivery test. | Operations environment, health, preflight. False/missing blocks monitoring readiness. **H** | Yes |
| `PRODUCTION_ALERT_OWNER` | Required Production evidence; restricted identity | — / — / R / C | Non-empty approved escalation-owner identifier; no URL/email syntax enforced. | Operations environment, health, preflight. Missing blocks monitoring readiness. **H** | Yes |

The application does **not** implement an alert destination variable or sender. `PRODUCTION_ALERT_OWNER` is an owner label, not a URL. Configure destinations in Vercel Observability/Drains or the approved monitoring provider. Supported destination syntax is therefore provider-specific (for example, an HTTPS webhook URL in that provider), not an application environment format. Do not invent `ALERT_WEBHOOK_URL`. Set the attestation only after a real test alert reaches the destination and the owner acknowledges it.

### 2.16 Feature flags and presentation integrations

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_DEMO_MODE` | Optional public flag | O / O / F / O | String compared to `"true"`; absent/other is off. | `components/demo-banner.tsx`. True exposes demo banner; must be absent/false in Production. **R** | Yes; browser-visible |
| `NEXT_PUBLIC_BANK_NAME` | Optional public financial display | O / O / O / C | Approved display text; fallback `Your Bank Name`. | `lib/payment-details.ts`. Public bank-transfer instructions; defaults are unsuitable for launch. **R** | Yes; browser-visible |
| `NEXT_PUBLIC_BANK_ACCOUNT_NAME` | Optional public financial display | O / O / O / C | Approved display text; fallback `Car Rental Company`. | `lib/payment-details.ts`. Same. **R** | Yes; browser-visible |
| `NEXT_PUBLIC_BANK_ACCOUNT_NUMBER` | Optional public financial display | O / O / O / C | Approved display text; fallback `1234567890`. | `lib/payment-details.ts`. Same. **R** | Yes; browser-visible |
| `NEXT_PUBLIC_BANK_SWIFT_CODE` | Optional public financial display | O / O / O / C | Approved display text; fallback `YOURSWIFT`. | `lib/payment-details.ts`. Same. **R** | Yes; browser-visible |
| `CLOUDINARY_CLOUD_NAME` | Conditional media identifier | O / O / O / C | Approved Cloudinary cloud name; no default. | `app/api/cloudinary/signature/route.ts`. Required with API pair for admin vehicle upload signing; otherwise route returns configuration error. **R** | Yes |
| `CLOUDINARY_API_KEY` | Conditional identifier/restricted | O / O / O / C | Cloudinary API key; no default. | Same route. Missing prevents signing. **R** | Yes |
| `CLOUDINARY_API_SECRET` | Conditional; **secret** | O / O / O / C | Cloudinary API secret; no default; server-only. | Same route. Missing prevents signing. **R** | Yes |
| `CLOUDINARY_FOLDER` | Optional media config | O / O / O / C | Server-owned folder string; default `rentcar/cars`. | Same route. Selects signed upload folder. **R** | Yes |

The Stripe variables in section 2.18 are not feature flags for this release; they are forbidden.

### 2.17 Local/test-only and non-production integration variables

| Variable | Req / secret | L / V / P / I | Format, allowed values, default and source | Consumer, feature, missing/invalid behavior, block | Deploy |
| --- | --- | --- | --- | --- | --- |
| `PHASE8F_DISPOSABLE_DATABASE_URL` | Test-only; **secret** | C / — / F / R | PostgreSQL URL for a disposable database only. | `scripts/verify-phase8f-review-concurrency.ts`. Missing aborts that verifier; never Production. **T** | No |
| `PRIVATE_DOCUMENT_INTEGRATION_ENABLED` | Harness gate; no | C / C / F / R | Exact `true`. | Non-production integration guard/provider harness. Missing/false rejects before provider use. **T** | Preview redeploy if run there |
| `PRIVATE_DOCUMENT_INTEGRATION_SYNTHETIC_ONLY` | Harness safety gate; no | C / C / F / R | Exact `true`. | Same guard. Missing/false rejects; only synthetic fixture bytes are allowed. **T** | Preview redeploy if run there |
| `PRIVATE_DOCUMENT_INTEGRATION_EXPECTED_PROJECT` | Harness binding; identifier | C / C / F / R | Exact OIDC `project` claim and must include `nonprod`. | Same guard. Missing/mismatch rejects. **T** | Preview redeploy if run there |
| `PRIVATE_DOCUMENT_INTEGRATION_STORE_NAME` | Harness binding; identifier | C / C / F / R | Approved store name containing `nonprod`. | Same guard. Missing/invalid rejects. **T** | Preview redeploy if run there |
| `PRIVATE_DOCUMENTS_PRODUCTION_ENABLED` | Negative harness guard; no | O / O / F / O | Must be absent or not `true`; no normal runtime feature consumes it. | Non-production integration guard. True rejects the harness as Production-like. **T** | Redeploy after removal |
| `TZ` | Test/process optional; no | O / O / O / O | IANA timezone or process-supported value; tests set deterministic values. | `tests/setup.ts` and test process behavior. Not application configuration. **T** | Test process restart |

### 2.18 Deprecated or forbidden variables that must be removed

| Variable | Status / secret | Evidence and required action |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Forbidden; **secret** | Production preflight fails if present. Remove from all release scopes; online payment is not enabled. |
| `STRIPE_WEBHOOK_SECRET` | Forbidden; **secret** | Same. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Forbidden; public | Same; remove it rather than treating it as a dormant flag. |
| `EMAIL_HOST` | Removed SMTP configuration; no | Appears only in stale `docs/EMAIL_SETUP.md`; no executable consumer. Remove from Vercel/local secret stores. |
| `EMAIL_PORT` | Removed SMTP configuration; no | Same; historical Nodemailer port. |
| `EMAIL_USER` | Removed SMTP configuration; restricted identity | Same; no executable consumer. |
| `EMAIL_PASS` | Removed SMTP configuration; **secret** | Same; rotate/invalidate if it was ever real, then remove. |

Nodemailer/SMTP is not the current sender. `package.json` has no direct Nodemailer dependency and `lib/email.tsx` uses Resend only. `EMAIL_FROM` remains active and is **not** deprecated. `CAR_DATABASE_URL` and `RESEND_FROM_EMAIL` are compatibility aliases, not removed names; do not create additional guessed aliases such as `AUTH_SECRET`, `AUTH_URL`, `SMTP_URL`, or `EMAIL_SERVER_*`.

## 3. Environment matrices

Legend: **Same** may use the same non-sensitive value; **Separate** must use environment-specific value/resource; **Prod only** is absent outside Production; **Preview only** is absent in Production; **Auto** is supplied by Vercel; **Conditional** is set only when that feature/test is deliberately enabled; **Forbidden** must be absent.

### 3.1 Local `.env` / Vercel Development

| Variables | Local `.env.local` | Vercel Development | Relationship |
| --- | --- | --- | --- |
| `DATABASE_URL` (`CAR_DATABASE_URL` only as compatibility) | Disposable/local DB | Dedicated development Neon branch | **Separate** from Preview/Production |
| `DIRECT_URL` | Optional operator-only direct URL | Do not add unless a controlled command explicitly maps it | Same branch as matching runtime URL; secret |
| `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL` | `http://localhost:3000` | Exact development origin | Separate origins; same value within one environment |
| `NEXTAUTH_SECRET`, Google credentials, `RATE_LIMIT_HASH_SECRET` | Local/dev values | Development-scoped values | **Separate** secrets; local Google callback may use localhost |
| `ADMIN_EMAILS`, `ADMIN_EMAIL`, `SUPPORT_EMAIL` | Synthetic/team development identities | Approved development identities | May be same only if policy permits; never infer Production roles |
| Resend variables | Omit or restricted development key/sender | Development-scoped restricted key/sender | **Separate** from Production; synthetic recipient only |
| Document provider/policy | `local-private`, docs usually false | Non-production Blob only if explicitly testing | Local adapter is local-only; never Production |
| `PRIVATE_DOCUMENT_LOCAL_ROOT` | Private disposable path | Absent | Local only |
| Blob system values | Temporary OIDC only when pulled | `BLOB_STORE_ID` binding and OIDC supplied by Vercel | Auto/conditional; never copy Production |
| Worker/Cron gates | false/empty | false/empty | Same dark values allowed; secrets may be omitted |
| Bank/Cloudinary/demo | Synthetic/dev configuration | Development configuration | Public values may match Preview, not assumed Production |
| Integration guards | Set only during approved synthetic harness | Set only on approved non-production project | **Conditional** / non-production only |

### 3.2 Vercel Preview

| Variable set | Preview requirement | Isolation rule |
| --- | --- | --- |
| `NODE_ENV`, `VERCEL`, `VERCEL_ENV`, `VERCEL_OIDC_TOKEN` | **Auto** (`VERCEL_ENV=preview`) | Do not manually forge platform evidence |
| `DATABASE_URL` | **Required** | Isolated Neon Preview branch/role/password; never Production |
| `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL` | **Required** | Exact stable Preview HTTPS origin and equal to one another |
| `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **Required** for sign-in | Separate client/secret preferred; exact stable Preview callback |
| `ADMIN_EMAILS`, `RATE_LIMIT_HASH_SECRET` | **Required** | Preview identities and a distinct rate-limit secret |
| `RESEND_API_KEY`, `EMAIL_FROM` | Conditional | Non-production key/domain and approved synthetic recipient only |
| `PRIVATE_DOCUMENTS_ENABLED`, `PRIVATE_DOCUMENT_STORAGE_PROVIDER`, `PRIVATE_DOCUMENT_ENVIRONMENT`, `PRIVATE_DOCUMENT_BLOB_STORE_ID`, `BLOB_STORE_ID`, `PRIVATE_DOCUMENT_BLOB_REGION`, both Blob attestations, `VERCEL`, `VERCEL_OIDC_TOKEN` | Ten values/markers required when document flows are enabled (`VERCEL`/OIDC auto) | Bind only the non-production private store; environment slug not `production` |
| `PRIVATE_DOCUMENT_REVIEW_MODE`, `PRIVATE_DOCUMENT_SCANNER_ENABLED` | Optional but explicitly recommend `manual` / `false` | Fake scanner stays off in deployed Preview unless a separately scoped test requires it |
| Four `PRIVATE_DOCUMENT_INTEGRATION_*` guards | Preview-only conditional | Required only for `pnpm test:documents:provider`; project/store names include `nonprod` |
| `PRIVATE_DOCUMENTS_PRODUCTION_ENABLED` | **Forbidden true** | Absent/false |
| Worker/Cron gates and allowlist | false/empty by default | Do not copy Production scheduler secrets or enable jobs |
| Production alert/recovery attestations | Absent | Never copy Production evidence merely to pass preflight |
| `BLOB_READ_WRITE_TOKEN`, Stripe, SMTP variables | **Forbidden** | Must be absent |

The Production preflight intentionally requires fully enabled documents/workers and current Production attestations. It is not a dark-Preview gate and should be expected to report dark-feature issue codes in Preview.

### 3.3 Vercel Production

| Variable set | Production requirement | Relationship |
| --- | --- | --- |
| `NODE_ENV`, `VERCEL`, `VERCEL_ENV`, `VERCEL_OIDC_TOKEN` | **Auto** | Production deployment only; OIDC rotates automatically |
| Database, URLs, Auth.js/Google, admin, rate-limit values | Required | **Separate** from every non-production value/resource |
| Resend canonical key/sender | Required | Client-owned Production account/domain/key |
| Private-document gate/provider/environment/store/region/attestations | Required final state | Production-only private store; local/fake paths disabled |
| `PRIVATE_DOCUMENT_REVIEW_MODE=manual`, `PRIVATE_DOCUMENT_SCANNER_ENABLED=false` | Explicitly recommended | Safe defaults exist, but record them visibly |
| Worker master gate, complete allowlist, worker secret, booking-maintenance gate, Cron secret | Required by final preflight | Start dark, then enable in stages; each secret distinct |
| Alert owner/attestation and recovery owner/timestamps | Required | **Prod only**; values represent verified evidence, not intent |
| Bank/Cloudinary values | Conditional on live presentation/media operations | Approved Production account/display values |
| Demo, static Blob token, Stripe, SMTP, integration guards, local root | **Forbidden/absent** | Never promote non-production/testing configuration |

## 4. Step-by-step provider setup

### 4.1 Neon

Official references: [Neon connection pooling](https://neon.com/docs/connect/connection-pooling), [branching](https://neon.com/docs/introduction/branching), [protected branches](https://neon.com/docs/guides/protected-branches), and [manual Vercel connection](https://neon.com/docs/guides/vercel-manual).

1. **Rotate first.** In the client-owned Neon project, identify the role used by the exposed connection string and reset/rotate its password. Update only approved secret stores, invalidate the old password, and redeploy affected environments. Verify the old connection can no longer authenticate without printing either URL.
2. Select/create the Production branch and record safe identifiers (project, branch, database, role, region) in the approved operations system. Protect the branch if the plan supports it.
3. Create an isolated Preview child branch and separate role/password, or configure the Neon–Vercel integration to create isolated Preview branches. Never scope the Production URL to Preview. Remove obsolete Preview branches according to policy.
4. For each branch, use Neon **Connect** to select the exact branch, database, and role. Obtain:
   - pooled runtime URL (`-pooler` hostname) for `DATABASE_URL`;
   - direct/unpooled URL for controlled migration/status/dump operations, held as operator-only `DIRECT_URL`.
5. In Vercel Project → Settings → Environment Variables, add Production `DATABASE_URL` only to Production, Preview `DATABASE_URL` only to Preview, and a development URL only to Development. Mark secret values sensitive. Do not assign one value to all scopes.
6. Confirm `DIRECT_URL` and `DATABASE_URL` resolve to the same safe branch/database/role identity. The current schema does not read `DIRECT_URL`; use the direct URL only through an explicit shell mapping:

   ```bash
   DATABASE_URL="$DIRECT_URL" pnpm exec prisma migrate status --schema prisma/schema.prisma
   ```

7. Run `pnpm exec prisma validate --schema prisma/schema.prisma`, `pnpm exec prisma generate --schema prisma/schema.prisma`, migration status, and then the approved `pnpm db:deploy` only when reviewed migrations need deployment. Use the direct URL mapping for migration commands if required by the provider/runbook.
8. **Never run `prisma migrate reset`, `pnpm db:push`, or `prisma db push` against Production.** Do not run `migrate dev` against Production. Correct Production forward with reviewed migrations.

### 4.2 Google OAuth and Auth.js

Official reference: [Google OAuth web-server redirect URI rules](https://developers.google.com/identity/protocols/oauth2/web-server).

1. In the client-owned Google Cloud project, configure the consent screen and create a Web application OAuth client. Prefer separate Production and non-production clients.
2. Add exact Production authorized origin and redirect URI:

   ```text
   Origin:   https://<production-domain>
   Redirect: https://<production-domain>/api/auth/callback/google
   ```

3. Google requires an exact redirect URI match (scheme, host, path, case, and trailing slash) and does not permit wildcard redirect URIs. For Preview, use a stable owned staging/Preview domain and add its exact callback. Do not attempt to register `*.vercel.app`.
4. Scope `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the matching Vercel environment. Generate a separate random `NEXTAUTH_SECRET` of at least 32 characters per environment.
5. Set `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to the same exact environment origin. Add localhost origin/callback only to the non-production client if local sign-in is required.
6. Redeploy after every client ID/secret, base URL, or session-secret change. Verify a fresh sign-in, callback, session, sign-out, disabled-user denial, and recent-auth protected action. Rotating `NEXTAUTH_SECRET` can invalidate existing sessions.

### 4.3 Resend

Official references: [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction) and [webhook event types](https://resend.com/docs/webhooks/event-types).

1. Have the client create/own the Resend account and invite only approved operators.
2. Add an owned sending subdomain/domain. Publish the exact SPF and DKIM records Resend shows; publish the provider-requested MX/return-path record and an approved DMARC policy. Wait for **verified** status.
3. Create a Production API key with the narrowest sending permission needed. Store it as Production-only `RESEND_API_KEY`; use a separate restricted non-production key if Preview sends.
4. Set canonical `EMAIL_FROM` to an address on the verified domain. Do not rely on `RESEND_FROM_EMAIL` in Production.
5. Name an approved synthetic test recipient. This is operational data, not an environment variable. In Preview, restrict tests to that recipient and never use a real customer's booking.
6. Run the unit request-generation test, then verify actual delivery through the approved synthetic Booking confirmation workflow in the deployed application. The repository has **no dedicated live-send script**; do not invent one. Confirm the Resend event progresses to delivered and the message appears in the recipient mailbox without exposing message content in evidence.
7. Configure an approved **HTTPS webhook destination** in Resend or an approved monitoring integration for at least `email.bounced`, `email.complained`, `email.failed`, and `email.delivery_delayed`. This repository has no Resend webhook route or signing-secret variable, so the destination must be an external receiver until separately implemented.
8. Trigger a controlled event/test supported by the provider and prove the destination receives it. Only then record monitoring evidence; do not equate `email.sent` with mailbox delivery.

### 4.4 Vercel Blob private stores and OIDC

Official references: [Vercel Blob private/public storage](https://vercel.com/docs/vercel-blob) and [OIDC authentication](https://vercel.com/changelog/vercel-blob-now-supports-oidc-authentication).

1. Create/connect a **private** non-production Blob store in `fra1` to the approved non-production project first. Ensure project/store naming includes `nonprod` for the repository harness.
2. Confirm the connection supplies the correct `BLOB_STORE_ID` and deployment `VERCEL_OIDC_TOKEN`. New OIDC connections use short-lived platform tokens. Do not paste a long-lived `BLOB_READ_WRITE_TOKEN`.
3. Set Preview `PRIVATE_DOCUMENT_BLOB_STORE_ID` to the expected non-production store ID, `PRIVATE_DOCUMENT_BLOB_REGION=fra1`, a distinct `PRIVATE_DOCUMENT_ENVIRONMENT` slug, and both attestations only after verification.
4. Run `pnpm test:documents:provider` with all non-production guard variables. It exercises connection/OIDC, private uploads, inspection/retrieval, validation, exact operation/path behavior, overwrite denial, cleanup, and unauthenticated-denial/security assertions using synthetic fixtures only.
5. After Preview passes, create a **different private Production store** in `fra1` and connect only the approved application project. Set expected store/region and verify safe identity equality.
6. Keep `PRIVATE_DOCUMENT_STORAGE_PROVIDER=vercel-blob-private`, `PRIVATE_DOCUMENT_REVIEW_MODE=manual`, and `PRIVATE_DOCUMENT_SCANNER_ENABLED=false` for Production. `local-private` and the deterministic fake scanner are not Production adapters.
7. Prove a Blob URL/object cannot be read without authorized application/provider credentials. Prove authorized server-side access works, no permanent URL is exposed, and logs contain no token, pathname, or customer data. Only then set private-access and region attestations true.
8. Redeploy the exact scope and verify the protected health dashboard. Never reuse the non-production store or environment prefix in Production.

### 4.5 Workers

1. Generate distinct random values (at least 32 characters) for `PHASE8FB_WORKER_SECRET` and `CRON_SECRET`; neither may equal `NEXTAUTH_SECRET` or `RATE_LIMIT_HASH_SECRET`.
2. Configure the scheduler to send `Authorization: Bearer <secret>` to the exact route, but do not activate schedules yet. Keep `PHASE8FB_WORKERS_ENABLED=false`, `PHASE8FB_WORKER_JOBS_ENABLED=` and `BOOKING_MAINTENANCE_WORKER_ENABLED=false` through dark launch.
3. Confirm alerts cover non-2xx invocations, failed executions, and missing successful heartbeats.
4. Enable `PHASE8FB_WORKERS_ENABLED=true` and advance only a cumulative allowlist in this order:
   1. `review-backlog`
   2. `stale-review`
   3. `application-expiry`
   4. `abandoned-upload-cleanup`
   5. `retention-processing`
   6. `orphan-reconciliation`
   7. `deletion-processing`
   8. `failed-deletion-retry`
   9. booking-maintenance cancellation separately via `BOOKING_MAINTENANCE_WORKER_ENABLED=true`
5. At every stage, invoke only the newly authorized job with approved synthetic/no-op conditions, require HTTP success plus a recent `WorkerExecution` row with `SUCCEEDED`, verify expected audit/metrics, test failure/missing-heartbeat alert delivery, and observe one approved interval. Deletion/retry require privacy/legal approval.
6. Final preflight expects all eight names and booking maintenance enabled; staged rollout may intentionally fail that final gate until activation is authorized.

### 4.6 Alerts

1. Select an approved external alerting destination (Vercel Observability/Drain or monitoring provider) and name its primary/backup owner outside the repository.
2. Configure the destination using that provider's supported format. The application supports only non-empty `PRODUCTION_ALERT_OWNER` plus boolean attestation; it does not parse an email, Slack URL, PagerDuty key, or webhook URL.
3. Route health failure, worker failure/missing heartbeat, database/Blob/email error, and bounce/complaint signals according to the operations runbook.
4. Send a real test alert, confirm receipt and escalation acknowledgement, then set `PRODUCTION_ALERTING_ATTESTED=true` and the owner label. Redeploy and verify protected health. Never set the flag based only on configuration screenshots.

## 5. Recommended setup order

1. Rotate the exposed Neon credential and prove the old credential is invalid.
2. Configure Production database variables using the selected Production branch.
3. Configure isolated Preview database variables using a separate Preview branch/role/password.
4. Configure Auth.js and exact Google OAuth origins/callbacks.
5. Configure the client-owned Resend account, verified domain, key, sender, test recipient and event destination.
6. Configure the Preview/non-production private Blob store and OIDC binding.
7. Verify the Preview deployment with documents/workers dark except the approved synthetic Blob harness.
8. Create and bind the separate Production private Blob store.
9. Configure Production feature flags dark/off: documents false, workers false, empty allowlist, booking maintenance false, demo false, scanner false.
10. Configure distinct worker and Cron authentication plus external scheduler definitions, still disabled.
11. Configure alert destinations and prove delivery.
12. Configure current backup/restore owner and evidence after an isolated restore rehearsal.
13. Bootstrap restricted-role vocabulary and explicitly assign required owners through the audited workflow.
14. Run production preflight against the intended final configuration; do not falsify attestations to make it pass.
15. Enable document features and workers in approved stages, verifying health/heartbeats/alerts after each deployment.

## 6. Safe example template

Copy only the names/placeholders needed for the intended environment. This is **not** a ready-to-run Production file. Never replace placeholders in a tracked file.

```dotenv
# Runtime/origins. Vercel supplies NODE_ENV; set it only for a local process.
NODE_ENV="<development-or-test>"
NEXT_PUBLIC_APP_URL="<exact-application-origin>"
NEXTAUTH_URL="<same-exact-auth-origin>"

# Neon. DATABASE_URL is pooled runtime access. DIRECT_URL is operator-only and
# is not consumed by the current Prisma schema/application.
DATABASE_URL="<pooled-postgres-url>"
DIRECT_URL="<direct-postgres-url>"
# Compatibility only; prefer DATABASE_URL.
CAR_DATABASE_URL="<optional-legacy-postgres-url>"

# Auth.js / Google OAuth. Every secret is distinct per environment.
NEXTAUTH_SECRET="<random-secret-at-least-32-characters>"
GOOGLE_CLIENT_ID="<google-oauth-web-client-id>"
GOOGLE_CLIENT_SECRET="<google-oauth-web-client-secret>"
ADMIN_EMAILS="<comma-separated-approved-admin-emails>"
ADMIN_EMAIL="<optional-legacy-admin-email>"
SUPPORT_EMAIL="<approved-support-email>"

# Shared PostgreSQL rate limiting.
RATE_LIMIT_HASH_SECRET="<distinct-random-secret-at-least-32-characters>"

# Resend. EMAIL_FROM must use a verified domain.
RESEND_API_KEY="<resend-api-key>"
EMAIL_FROM="<display-name-and-verified-sender-address>"
RESEND_FROM_EMAIL="<optional-compatibility-sender>"

# Private documents. Start gates false and use manual review/no scanner.
PRIVATE_DOCUMENTS_ENABLED="<true-or-false>"
PRIVATE_DOCUMENT_STORAGE_PROVIDER="<local-private-or-vercel-blob-private>"
PRIVATE_DOCUMENT_REVIEW_MODE="manual"
PRIVATE_DOCUMENT_SCANNER_ENABLED="false"
PRIVATE_DOCUMENT_ENVIRONMENT="<environment-slug>"
PRIVATE_DOCUMENT_LOCAL_ROOT="<local-disposable-private-path>"
PRIVATE_DOCUMENT_MAXIMUM_UPLOAD_BYTES="<positive-integer-up-to-10485760>"
PRIVATE_DOCUMENT_UPLOAD_GRANT_SECONDS="<positive-integer-up-to-600>"
PRIVATE_DOCUMENT_RECENT_AUTH_SECONDS="<positive-integer-up-to-600>"
PRIVATE_DOCUMENT_RECONCILIATION_BATCH_SIZE="<positive-integer-up-to-100>"

# Expected Blob identity and verified evidence. Vercel/integration supplies
# BLOB_STORE_ID and VERCEL_OIDC_TOKEN; never paste a Production OIDC token.
PRIVATE_DOCUMENT_BLOB_STORE_ID="<expected-private-blob-store-id>"
PRIVATE_DOCUMENT_BLOB_REGION="fra1"
PRIVATE_DOCUMENT_BLOB_PRIVATE_ACCESS_ATTESTED="<true-only-after-verification>"
PRIVATE_DOCUMENT_BLOB_REGION_ATTESTED="<true-only-after-verification>"
BLOB_STORE_ID="<integration-supplied-store-id>"
VERCEL_OIDC_TOKEN="<platform-supplied-ephemeral-oidc-token>"

# Workers/Cron. Start disabled and allowlist empty.
PHASE8FB_WORKERS_ENABLED="false"
PHASE8FB_WORKER_JOBS_ENABLED="<comma-separated-approved-job-names-or-empty>"
PHASE8FB_WORKER_SECRET="<distinct-random-secret-at-least-32-characters>"
BOOKING_MAINTENANCE_WORKER_ENABLED="false"
CRON_SECRET="<distinct-random-secret-at-least-32-characters>"

# Production operational evidence. Set attestations only after real checks.
PRODUCTION_ALERTING_ATTESTED="<true-only-after-alert-delivery>"
PRODUCTION_ALERT_OWNER="<approved-owner-identifier>"
DATABASE_RECOVERY_OWNER="<approved-recovery-owner-identifier>"
DATABASE_BACKUP_VERIFIED_AT="<current-iso-8601-timestamp>"
DATABASE_RESTORE_VERIFIED_AT="<iso-8601-restore-rehearsal-timestamp>"

# Public bank-transfer presentation; these values are browser-visible.
NEXT_PUBLIC_BANK_NAME="<approved-bank-display-name>"
NEXT_PUBLIC_BANK_ACCOUNT_NAME="<approved-account-holder-display-name>"
NEXT_PUBLIC_BANK_ACCOUNT_NUMBER="<approved-public-account-display-value>"
NEXT_PUBLIC_BANK_SWIFT_CODE="<approved-public-swift-display-value>"

# Optional administrator vehicle-media integration.
CLOUDINARY_CLOUD_NAME="<cloudinary-cloud-name>"
CLOUDINARY_API_KEY="<cloudinary-api-key>"
CLOUDINARY_API_SECRET="<cloudinary-api-secret>"
CLOUDINARY_FOLDER="<server-owned-cloudinary-folder>"

# Public demo banner must remain false/absent in Production.
NEXT_PUBLIC_DEMO_MODE="false"

# Non-production synthetic provider harness only; never Production.
PRIVATE_DOCUMENT_INTEGRATION_ENABLED="<true-only-during-approved-harness>"
PRIVATE_DOCUMENT_INTEGRATION_SYNTHETIC_ONLY="true"
PRIVATE_DOCUMENT_INTEGRATION_EXPECTED_PROJECT="<nonprod-project-name>"
PRIVATE_DOCUMENT_INTEGRATION_STORE_NAME="<nonprod-private-store-name>"
PRIVATE_DOCUMENTS_PRODUCTION_ENABLED="false"

# Controlled restore/concurrency operator sessions only; do not persist.
PRODUCTION_RESTORE_REHEARSAL_CONFIRMED="synthetic-only"
SOURCE_DATABASE_URL="<approved-direct-source-postgres-url>"
RESTORE_DATABASE_URL="<empty-isolated-direct-target-postgres-url>"
PHASE8F_DISPOSABLE_DATABASE_URL="<disposable-postgres-url>"
TMPDIR="<optional-writable-temporary-directory>"
TZ="<optional-iana-test-timezone>"

# Intentionally absent: BLOB_READ_WRITE_TOKEN, all Stripe variables, and
# EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASS.
```

## 7. Verification commands

Run from the repository root. Never prepend a command that prints environment values. Standalone Prisma/`tsx` commands use the current shell environment; load secrets through an approved local mechanism without echoing them.

### Repository validation

```bash
pnpm production:preflight
pnpm exec prisma validate --schema prisma/schema.prisma
pnpm exec prisma generate --schema prisma/schema.prisma
pnpm exec prisma migrate status --schema prisma/schema.prisma
pnpm build
pnpm typecheck
pnpm lint
pnpm test:run
```

For an approved direct Neon status check, because `DIRECT_URL` is not wired into the schema:

```bash
DATABASE_URL="$DIRECT_URL" pnpm exec prisma migrate status --schema prisma/schema.prisma
```

Use `pnpm db:deploy` only for an approved deployment of already-reviewed migrations. Never use `pnpm db:push`, `pnpm db:migrate`, migrate reset, or raw schema mutation against Production.

### Health and protected operational evidence

```bash
curl --fail --silent --show-error https://<deployment-origin>/api/health
```

Open `https://<deployment-origin>/<locale>/admin/health` in an authenticated authorized browser session. There is no repository CLI for protected dashboard authentication.

### Worker denial and heartbeat

An unauthenticated request must be denied:

```bash
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  -X POST https://<deployment-origin>/api/internal/phase8fb/review-backlog
```

An authorized invocation uses the approved scheduler or a controlled shell whose bearer secret is already present; do not place the secret in shell history. Afterward, verify a recent successful `WorkerExecution` in the protected health dashboard. The repository has no worker-health CLI and no schedule in source.

### Blob connectivity

```bash
pnpm test:documents:provider
```

Run only with the complete non-production guard/binding environment and synthetic fixtures. It must never target Production. Use the protected health dashboard for Production provider readiness; do not run destructive ad-hoc Blob commands.

### Resend verification

```bash
pnpm test:run -- tests/unit/production/resend-email.test.ts
```

That test validates request construction and safe failure only; it does not deliver email. Actual delivery must be verified through the approved synthetic Booking confirmation workflow, the recipient mailbox, and Resend delivered/bounce/complaint events. No live-send script exists in `package.json`.

### Backup/restore rehearsal

```bash
pnpm production:verify-restore
```

This requires the three restore-guard variables plus `pg_dump`, `pg_restore`, and `psql`, and it refuses a non-empty/same target. Use only approved isolated synthetic/disposable targets.

### Restricted-role vocabulary

```bash
pnpm documents:roles:bootstrap
```

This does not assign users. Verify assignments through the audited admin workflow and protected health dashboard.

## 8. Troubleshooting

| Symptom | Likely cause | Safe resolution |
| --- | --- | --- |
| Preview reads Production data | Preview `DATABASE_URL` was scoped to all environments or points to Production branch | Stop Preview use, revoke/rotate affected credential if exposed, replace with isolated branch URL, redeploy, verify safe branch identity |
| Google `redirect_uri_mismatch` | Callback origin/path differs, ephemeral Preview URL used, or trailing slash/scheme mismatch | Register exact stable Preview/Production `/api/auth/callback/google`, align both base URLs, redeploy |
| Resend rejects sender or only permits account owner | Domain/DNS not verified, key scope wrong, From domain mismatch, or unapproved recipient | Complete SPF/DKIM/MX verification, use verified `EMAIL_FROM`, separate key, approved synthetic recipient |
| Resend request succeeds but no receipt | `email.sent` is not delivery, or bounce/complaint/suppression occurred | Inspect provider events safely, verify delivered/bounced/complained destination, do not log message/recipient data |
| Blob store mismatch | Expected and injected IDs differ, or wrong project/store scope | Disconnect wrong binding, connect exact environment store, set expected ID, redeploy, rerun non-production harness |
| Local adapter selected in deployed environment | Provider absent/invalid defaults to `local-private` | Set `vercel-blob-private` and correct OIDC/store binding; never create a Production filesystem workaround |
| Fake scanner enabled | `PRIVATE_DOCUMENT_SCANNER_ENABLED=true` or review mode `scanner` | Set scanner false and review mode manual, redeploy, verify health |
| Worker route returns 401/403 | Master gate false, job absent from allowlist, missing/wrong bearer secret, or booking Cron disabled | Check names/scope without printing values; advance only approved stage; synchronize scheduler secret and redeploy |
| Production health is blocked | Any provider/attestation/heartbeat/role/DB/email evidence missing or stale | Read exact protected check, fix underlying evidence, never set an attestation merely to silence it |
| Restricted role check fails | Vocabulary absent or no user assigned to required role | Run bootstrap, then assign explicit reviewer/security/retention owners through audited UI; `ADMIN_EMAILS` is insufficient |
| Vercel still uses old value | Environment changed without new deployment or wrong scope/branch override | Redeploy exact environment/branch, verify deployment ID and safe configuration fingerprints |
| Prisma migration fails with pooled/direct confusion | Pooled runtime URL used for an operation needing direct semantics, or direct URL targets another branch | Verify both safe identities; map approved `DIRECT_URL` to `DATABASE_URL` only for the controlled command |
| Local OIDC suddenly fails | Pulled `VERCEL_OIDC_TOKEN` expired or belongs to wrong project/environment | Relink safely and re-pull Development/Preview environment; never copy Production token |
| Production preflight fails while features are intentionally dark | Preflight models final fully enabled state | Record expected dark-state codes; do not falsify state. Run final preflight only at the authorized activation gate |

## 9. Final launch checklist

### Security and isolation

- [ ] Previously exposed Neon password rotated; old credential proven invalid without printing it.
- [ ] No real secret appears in source, docs, screenshots, logs, tickets, or shell history.
- [ ] Production, Preview, and Development database credentials are separate.
- [ ] Preview safe identity proves it is not the Production Neon branch/database/role.
- [ ] Production and non-production private Blob stores/projects/environment prefixes are separate.
- [ ] No `BLOB_READ_WRITE_TOKEN`, Stripe, or SMTP/Nodemailer variable exists in Production.

### Core, database, and auth

- [ ] Production `DATABASE_URL` is the pooled URL for the approved Production branch.
- [ ] Operator-only direct URL matches the same branch/database/role; it is not assumed to be consumed by Prisma.
- [ ] Prisma validate/generate/migrate status pass; no reset/db-push/migrate-dev was run in Production.
- [ ] `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` are exact, equal Production HTTPS origins.
- [ ] `NEXTAUTH_SECRET` is unique and at least 32 characters.
- [ ] Production and stable Preview Google origins/callbacks are exact and tested.
- [ ] `ADMIN_EMAILS` contains only approved identities.
- [ ] `RATE_LIMIT_HASH_SECRET` is present, unique, and at least 32 characters.

### Email and presentation

- [ ] Client owns Resend account and verified sending domain/DNS.
- [ ] Production Resend key and canonical verified `EMAIL_FROM` are scoped correctly.
- [ ] Approved synthetic recipient received an actual Booking confirmation.
- [ ] Delivered, failed, bounce, complaint, and delay events reach the approved destination.
- [ ] Bank-transfer public values are approved and no template fallback is visible.
- [ ] Cloudinary values are configured only if admin vehicle media upload is required.
- [ ] Demo mode is false/absent.

### Private documents

- [ ] Production provider is `vercel-blob-private`; local adapter is absent.
- [ ] Production store is private, in `fra1`, and expected/actual IDs match.
- [ ] OIDC is deployment-supplied; no static Production Blob token exists.
- [ ] Unauthenticated Blob read is denied; authorized application flow passes.
- [ ] Environment slug is `production`; non-production uses a distinct slug.
- [ ] Manual review is selected and scanner/fake scanner is disabled.
- [ ] Size, grant, recent-auth, and reconciliation values are within hard bounds.

### Operations

- [ ] Alert destination test delivered and owner acknowledged before attestation.
- [ ] Recovery owner is assigned; backup timestamp is within 24 hours.
- [ ] Isolated restore rehearsal passed; timestamp is within 90 days.
- [ ] Restricted role vocabulary exists and reviewer/security/retention users are explicitly assigned.
- [ ] Worker and Cron secrets are distinct, at least 32 characters, and synchronized with schedulers.
- [ ] Workers started dark and each cumulative stage produced a successful heartbeat/audit/alert test.
- [ ] Booking maintenance was enabled only after the eight document worker stages.

### Final evidence

- [ ] `pnpm production:preflight` passes against final intended Production state.
- [ ] Prisma validation/generation/status, build, typecheck, lint, and tests pass.
- [ ] Public `/api/health` passes on the exact deployment.
- [ ] Protected health dashboard is READY with current database evidence.
- [ ] Actual Resend delivery, Blob privacy/connectivity, Google sign-in/recent auth, BookingApplication and manual review flows pass with synthetic data.
- [ ] Exact deployment ID/commit, provider safe identifiers, owners, timestamps, and GO decision are recorded in the approved operational system.

## Validation record and inspection scope

The repository-wide search covered all **515 tracked files** on `release/production-v1`, excluding generated/untracked `graphify-out/` from source-of-truth counts. Configuration-bearing files inspected directly include:

- `.env.local.example`, `package.json`, `next.config.mjs`, `prisma/schema.prisma`, and `prisma/schema.prisma.bak`;
- `lib/config.ts`, `lib/db-url.ts`, `lib/db.ts`, `lib/auth.ts`, `lib/auth-edge.ts`, `lib/email.tsx`, `lib/rate-limit.ts`, `lib/payment-details.ts`, `lib/business-info.ts`, and `lib/logger.ts`;
- private-document environment, non-production guard, server context, storage factory/local/Blob adapters and clients, recent-auth, retention, deletion, review, health, monitoring, and domain policy modules;
- `lib/production/health.ts`, `lib/production/operations-environment.ts`, public/protected health routes, Auth.js route, worker route, booking Cron route, Cloudinary signing route, and demo banner;
- `scripts/with-db-url.ts`, `scripts/production/validate-environment.ts`, `scripts/production/verify-postgres-restore.sh`, `scripts/private-documents/vercel-blob-integration.ts`, `scripts/private-documents/bootstrap-restricted-roles.ts`, `scripts/verify-phase8f-review-concurrency.ts`, and relevant synthetic fixtures;
- environment-setting/production tests, `.env.local.example`, production audit documents 19–28, and stale `docs/EMAIL_SETUP.md` solely to identify removed SMTP names.

Mechanical validation for this guide must confirm:

- all 67 executable-code names appear in this document;
- all `.env.local.example` keys appear;
- every dynamic Production preflight key and forbidden Stripe key appears;
- all four exact historical SMTP names appear as removed;
- no connection string, API key, OAuth secret, OIDC JWT, bearer secret, or real email/account value appears;
- `git diff --check` passes and no application/environment file changed.
