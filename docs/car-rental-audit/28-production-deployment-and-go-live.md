# Phase 12 — controlled production deployment and go-live

Date: 2026-07-15. Status: **release candidate prepared locally; production remains unchanged; release branch push is gated on Preview environment isolation**.

This document is the operational handoff for the existing Vercel application and Neon PostgreSQL database. It contains no credentials or customer data. Production deployment, production migration, Blob provisioning, worker activation, role assignment, and customer go-live remain explicitly out of scope until the final owner gate.

## Release identity

- Application release commit: `89c4e99102371e8a493b51fe221e9c19d4bd1bcc` (`feat: prepare production release`).
- Release branch: `release/production-v1`.
- Remote base at preparation: `origin/main`.
- Included history: the exact 51-commit range `origin/main..89c4e99102371e8a493b51fe221e9c19d4bd1bcc`.
- The range contains the approved Phase 1–8F-B history plus the final Phase 9–11/offline-payment release commit. The authoritative inventory command is:

  ```bash
  git log --reverse --format='%H %s' origin/main..89c4e99102371e8a493b51fe221e9c19d4bd1bcc
  ```

- This runbook is added by a documentation-only commit after the application release commit so the application SHA can be recorded without a self-referential commit hash.
- No `graphify-out/` file is part of the release. `.graphifyignore` is intentionally committed. `.env` and `.env.local` remain ignored; `.env.local.example` is the only committed environment template.

## Validation evidence

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm exec prisma validate` | PASS |
| `pnpm exec prisma generate` | PASS |
| PostgreSQL 16 replay from an empty disposable database | PASS — 33/33 migrations |
| `pnpm exec prisma migrate status` | PASS — database schema current |
| Database-to-schema drift check | PASS — `No difference detected` |
| `pnpm typecheck` | PASS |
| `pnpm test:run` | PASS — 43 files, 284 tests |
| Scoped ESLint over 44 changed/new JS/TS files | PASS — no findings |
| Repository ESLint | Inherited baseline only — 30 errors, 27 warnings, exactly matching Phases 9–11 |
| `pnpm build` | PASS — Next.js 16.2.10, 65 pages |
| `git diff --check` | PASS |
| Staged secret-pattern scan | PASS — no token/private-key pattern found |
| `pnpm audit --prod` | Tooling unavailable — npm audit endpoint returned HTTP 410; no package change was made |

The first replay exposed an overlong manually named unique index in the untracked offline-payment migration. PostgreSQL truncated it differently from Prisma. The index identifier was corrected before commit, then all 33 migrations were replayed again and the drift check passed. The constraint columns and data transformation did not change.

## Migration inventory

The production operator must verify the existing production migration history before authorizing either pending migration.

1. `20251230082045_add_year_to_car`
2. `20251231053558_add_company_settings`
3. `20260104182400_add_business_info_fields`
4. `20260104182400_add_nextauth_tables` (recorded no-op duplicate)
5. `20260106004518_add_nextauth_tables`
6. `20260213121000_add_user_active_status`
7. `20260213134500_add_booking_payment_method`
8. `20260213175220_new_one`
9. `20260213211500_add_reviews`
10. `20260213224500_add_guarantee_settings_and_amount`
11. `20260214004500_drop_provider_id_unique_index`
12. `20260214023000_add_booking_locale`
13. `20260712213000_add_authorization_foundation`
14. `20260712213100_add_legal_publication_foundation`
15. `20260712213200_add_business_configuration_and_fleet_rates`
16. `20260712213300_add_booking_snapshots_and_legal_evidence`
17. `20260712213400_add_customer_document_metadata_and_audit`
18. `20260712213500_add_compatibility_data_and_immutability`
19. `20260712221500_enable_compatibility_pricing_snapshots`
20. `20260713003000_add_phase6_snapshot_provenance`
21. `20260713100000_add_phase7_legal_provenance`
22. `20260713110000_add_phase8_upload_foundation`
23. `20260713110100_add_phase8_document_provenance`
24. `20260713110200_add_phase8_scan_evidence`
25. `20260713110300_add_phase8_retention_hold_deletion`
26. `20260713110400_add_phase8_restricted_capabilities`
27. `20260713110500_add_phase8_lifecycle_integrity`
28. `20260713120000_allow_pending_document_replacements`
29. `20260713130000_add_phase8f_manual_review`
30. `20260713140000_add_phase8fb_booking_application`
31. `20260713141000_enforce_phase8fb_shared_location_and_review`
32. `20260714130000_add_phase9_operations`
33. `20260714150000_add_method_specific_payment_instructions`

Migration 32 only adds `RateLimitBucket` and `WorkerExecution`. Migration 33 adds and backfills `PaymentInstructionTranslation.method`, makes it required, and changes the unique/index definitions to include the offline payment method. Both are additive to customer and Booking evidence and were replay-tested. Do not use `db push`, `migrate reset`, manual production DDL, or rewritten migration history.

## Legacy-application compatibility decision

The requested migration-before-deployment order is **not safe under unrestricted legacy writes**.

- Migration 32 is compatible with the old application.
- Migration 33 is read-compatible for existing rows after backfill.
- Migration 33 is not write-compatible with old code that creates or rewrites payment-instruction translations because old code does not supply the newly required `method` column and still assumes the former two-column uniqueness contract.

Therefore production must use an approved short maintenance/write-freeze window. Freeze public BookingApplication/finalization writes and all Business Configuration/payment edits before the database checkpoint. Keep the freeze until the new application artifact passes health and synthetic verification. If a write freeze cannot be approved, stop and replace migration 33 with a separately reviewed expand/deploy/contract migration sequence before production.

## Read-only Vercel inventory

The connected read-only Vercel account returned the following candidates. They are evidence, not owner approval:

| Purpose | Candidate |
| --- | --- |
| Team | `rusujobs-3774's projects` / `team_eCqAADZN7NQMTvnd2J9FniNU` |
| Existing application project | `car-rental` / `prj_mO6ZiLR18fpph7SkVptWmMEuNuwl` |
| Project framework/runtime | Next.js / Node.js `24.x` |
| Latest recorded production deployment | `dpl_8wb1WBDYGXmpPD5Yo6GBAfsW4ej1` / READY |
| Candidate domains | `car-rental-psi-cyan.vercel.app`, `car-rental-rusujobs-3774s-projects.vercel.app`, `car-rental-git-main-rusujobs-3774s-projects.vercel.app` |
| Project that must not be linked as production | `car-rental-documents-nonprod` / `prj_86Vxvjxa9E456GAD4mdiE8rBbnO7` |

The application project currently reports `live: false`; the owner must explain/accept that state and select the exact production domain before linking or deployment.

### CLI authentication and deterministic linking

Run only after the owner confirms the team ID, application project ID, and production domain:

```bash
vercel login
vercel whoami
vercel teams ls
vercel projects ls --scope rusujobs-3774s-projects
vercel link --yes --scope rusujobs-3774s-projects --project car-rental
```

Then inspect `.vercel/project.json` locally and require exact equality:

```text
orgId     = approved team ID
projectId = approved existing application project ID
```

`.vercel/` is gitignored. Never print or commit its credentials. Abort immediately if the link resolves to `car-rental-documents-nonprod` or any unapproved project. Vercel OIDC authenticates deployed workloads; it does not replace CLI authentication.

## Environment-variable inventory

Scopes: **D** Development, **V** Preview, **P** Production, **O** controlled operator session. “Template” refers to `.env.local.example`. Production values must be compared by name/scope and safe fingerprint only; never print values.

| Variable | Scope | Secret | Source / template | Safe validation and blocked surface |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | D/V/P | No | Next.js, preflight / yes | `production` for Vercel builds; blocks production preflight |
| `VERCEL_ENV` | V/P | No, system | Vercel, provider harness / no | Must equal target environment; guards non-production harness |
| `VERCEL` | V/P | No, system | Vercel, document environment / no | Must be truthy for production document runtime |
| `DATABASE_URL` | D/V/P/O | Yes | Prisma, DB, preflight / yes | PostgreSQL URL; Preview must be non-production; blocks build/runtime/migrations/health |
| `CAR_DATABASE_URL` | D/V/P | Yes | compatibility DB resolver / no | Deprecated fallback; prefer `DATABASE_URL`; duplicate DB naming risk |
| `NEXT_PUBLIC_APP_URL` | D/V/P | No | config, email, preflight / yes | Exact HTTPS origin in V/P; blocks auth/email/runtime |
| `NEXTAUTH_URL` | D/V/P | No | config, preflight / yes | Must exactly equal approved base origin; blocks Auth.js |
| `NEXTAUTH_SECRET` | D/V/P | Yes | Auth.js, rate-limit fallback, preflight / yes | Unique, at least 32 characters; blocks auth/runtime |
| `GOOGLE_CLIENT_ID` | D/V/P | Identifier | Auth.js, preflight / yes | Approved OAuth client; blocks auth |
| `GOOGLE_CLIENT_SECRET` | D/V/P | Yes | Auth.js, preflight / yes | Non-empty; blocks auth |
| `ADMIN_EMAILS` | D/V/P | Restricted config | config, preflight / yes | Explicit comma-separated production identities; blocks admin/runtime |
| `ADMIN_EMAIL` | D/V/P | Restricted config | compatibility config/email / no | Legacy fallback only; remove when `ADMIN_EMAILS` and support owner are set |
| `SUPPORT_EMAIL` | D/V/P | Restricted config | email/business info / no | Valid approved address; affects email content |
| `RATE_LIMIT_HASH_SECRET` | V/P | Yes | rate limiting, preflight / yes | Unique, at least 32 characters, distinct from auth/worker secrets; blocks protected runtime |
| `RESEND_API_KEY` | V/P | Yes | Resend, config, preflight / yes | `re_` format; Preview key must not authorize unapproved recipients; blocks email/health |
| `EMAIL_FROM` | V/P | No/restricted | email, preflight / yes | Approved verified sender, not default; blocks email/health |
| `RESEND_FROM_EMAIL` | D/V/P | No/restricted | compatibility email fallback / yes | Compatibility alias; `EMAIL_FROM` is canonical |
| `PRIVATE_DOCUMENTS_ENABLED` | D/V/P | No | document environment, preflight / yes | `false` initially in V/P; blocks documents |
| `PRIVATE_DOCUMENT_STORAGE_PROVIDER` | D/V/P | No | storage factory, preflight / yes | `local-private` only locally; `vercel-blob-private` after production approval |
| `PRIVATE_DOCUMENT_REVIEW_MODE` | D/V/P | No | document environment / yes | Must remain `manual` for production documents |
| `PRIVATE_DOCUMENT_SCANNER_ENABLED` | D/V/P | No | document environment / yes | Must be `false` for the approved manual-review model |
| `PRIVATE_DOCUMENT_ENVIRONMENT` | D/V/P | No | Blob path isolation, preflight / yes | Safe slug; exact `production` only in P |
| `PRIVATE_DOCUMENT_LOCAL_ROOT` | D/V | Sensitive path | local adapter / yes | Local/disposable only; never production storage |
| `PRIVATE_DOCUMENT_MAXIMUM_UPLOAD_BYTES` | D/V/P | No | document environment / yes | Positive and no more than 10 MiB |
| `PRIVATE_DOCUMENT_UPLOAD_GRANT_SECONDS` | D/V/P | No | document environment / yes | Positive and no more than 600 seconds |
| `PRIVATE_DOCUMENT_RECENT_AUTH_SECONDS` | D/V/P | No | document auth / yes | Positive and no more than 600 seconds |
| `PRIVATE_DOCUMENT_RECONCILIATION_BATCH_SIZE` | D/V/P | No | reconciliation / yes | Positive and no more than 100 |
| `PRIVATE_DOCUMENT_BLOB_STORE_ID` | V/P | Identifier | document environment, preflight / yes | Must match injected `BLOB_STORE_ID`; blocks documents/health |
| `PRIVATE_DOCUMENT_BLOB_REGION` | V/P | No | document environment, preflight / yes | Current code requires `fra1`; owner approval still required |
| `PRIVATE_DOCUMENT_BLOB_PRIVATE_ACCESS_ATTESTED` | V/P | Evidence flag | document environment, preflight / yes | Set `true` only after private-access verification |
| `PRIVATE_DOCUMENT_BLOB_REGION_ATTESTED` | V/P | Evidence flag | document environment, preflight / yes | Set `true` only after region verification |
| `BLOB_STORE_ID` | V/P | Identifier, injected | Vercel Blob / yes | Must match expected store; blocks documents/health |
| `VERCEL_OIDC_TOKEN` | V/P | Ephemeral secret, injected | Vercel Blob/OIDC, preflight / yes | Deployment-issued only; never commit; blocks documents/health |
| `BLOB_READ_WRITE_TOKEN` | None in P | Yes | negative guards / no | Forbidden in Production; static-token presence blocks preflight |
| `PHASE8FB_WORKERS_ENABLED` | V/P | No | worker route, health, preflight / yes | `false` for Preview/dark launch; enable only after staged approval |
| `PHASE8FB_WORKER_JOBS_ENABLED` | V/P | No | worker allowlist, preflight / yes | Empty initially; later cumulative approved job list |
| `PHASE8FB_WORKER_SECRET` | P | Yes | worker route, preflight / yes | Unique, at least 32 characters; blocks workers |
| `BOOKING_MAINTENANCE_WORKER_ENABLED` | V/P | No | booking cron, preflight / yes | `false` initially; blocks booking maintenance worker |
| `CRON_SECRET` | P | Yes | booking cron, preflight / yes | Unique, at least 32 characters; blocks booking maintenance worker |
| `PRODUCTION_ALERTING_ATTESTED` | P | Evidence flag | operations health/preflight / yes | `true` only after alert delivery test; blocks health |
| `PRODUCTION_ALERT_OWNER` | P | Restricted config | operations health/preflight / yes | Named owner identifier; blocks health |
| `DATABASE_RECOVERY_OWNER` | P | Restricted config | operations health/preflight / yes | Named recovery owner; blocks recovery health |
| `DATABASE_BACKUP_VERIFIED_AT` | P | Evidence timestamp | operations health/preflight / yes | ISO timestamp no older than 24 hours |
| `DATABASE_RESTORE_VERIFIED_AT` | P | Evidence timestamp | operations health/preflight / yes | ISO timestamp no older than 90 days |
| `NEXT_PUBLIC_BANK_NAME` | D/V/P | Public config | payment details / yes | Approved display text; browser-visible |
| `NEXT_PUBLIC_BANK_ACCOUNT_NAME` | D/V/P | Public config | payment details / yes | Approved display text; browser-visible |
| `NEXT_PUBLIC_BANK_ACCOUNT_NUMBER` | D/V/P | Public financial config | payment details / yes | Approved display value; browser-visible |
| `NEXT_PUBLIC_BANK_SWIFT_CODE` | D/V/P | Public financial config | payment details / yes | Approved display value; browser-visible |
| `CLOUDINARY_CLOUD_NAME` | D/V/P | Identifier | admin media signing / yes | Required only if admin vehicle media uploads remain enabled |
| `CLOUDINARY_API_KEY` | D/V/P | Identifier/restricted | admin media signing / yes | Paired with approved Cloudinary account |
| `CLOUDINARY_API_SECRET` | D/V/P | Yes | admin media signing / yes | Never browser-exposed; blocks admin media writes |
| `CLOUDINARY_FOLDER` | D/V/P | No | admin media signing / yes | Fixed server-owned folder; no browser override |
| `NEXT_PUBLIC_DEMO_MODE` | D/V/P | No | demo banner / no | Must be absent or `false` in Production |

### Controlled operator and harness variables

| Variable | Scope | Purpose / rule |
| --- | --- | --- |
| `SOURCE_DATABASE_URL` | O, secret | Source for isolated native restore verification; never write to source |
| `RESTORE_DATABASE_URL` | O, secret | Empty isolated target; must fingerprint differently from source |
| `PRODUCTION_RESTORE_REHEARSAL_CONFIRMED` | O | Existing script accepts only `synthetic-only`; do not mislabel a production-data restore as synthetic |
| `PHASE8F_DISPOSABLE_DATABASE_URL` | O, secret | Disposable concurrency verification only |
| `PRIVATE_DOCUMENT_INTEGRATION_ENABLED` | V/O | Explicit non-production provider harness gate |
| `PRIVATE_DOCUMENT_INTEGRATION_SYNTHETIC_ONLY` | V/O | Must be `true`; synthetic objects only |
| `PRIVATE_DOCUMENTS_PRODUCTION_ENABLED` | V/O | Must not be `true` in the non-production harness |
| `PRIVATE_DOCUMENT_INTEGRATION_EXPECTED_PROJECT` | V/O | Must contain and match the approved non-production project claim |
| `PRIVATE_DOCUMENT_INTEGRATION_STORE_NAME` | V/O | Must identify the approved non-production store |

### Obsolete and forbidden names

- Do not add `AUTH_SECRET` or `AUTH_URL` alongside the repository's canonical `NEXTAUTH_SECRET` and `NEXTAUTH_URL` without a separately reviewed Auth.js migration.
- Direct SMTP/Nodemailer configuration is obsolete. After authenticated Vercel access, flag/remove any `SMTP_*`, `EMAIL_SERVER*`, `EMAIL_USER`, `EMAIL_PASSWORD`, or Nodemailer-only values. Auth.js may retain optional lockfile peer metadata; the application has no direct Nodemailer dependency or SMTP sender.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are forbidden for this release and make production preflight fail.
- Prefer `DATABASE_URL`; treat `CAR_DATABASE_URL` as a compatibility alias to remove after Vercel inventory confirms it is unnecessary.

## Preview deployment gate

Vercel creates a deployment for each pushed commit by default. Therefore the branch must not be pushed until Preview environment isolation is verified by name/scope without revealing values.

Required Preview state:

- `DATABASE_URL` points to a disposable/non-production Neon branch, never production.
- Preview Auth.js URLs and Google callback use an approved stable Preview origin.
- `PRIVATE_DOCUMENTS_ENABLED=false` unless the separately approved non-production Blob/OIDC binding is attached.
- `PHASE8FB_WORKERS_ENABLED=false`, empty worker allowlist, and `BOOKING_MAINTENANCE_WORKER_ENABLED=false`.
- Resend is disabled or restricted to the approved synthetic recipient/domain.
- No Production Blob store identifiers or static Blob token exist in Preview.
- No Production-only alert/recovery attestations are copied into Preview.

The current `production:preflight` command is intentionally production-only and requires documents and all workers enabled. It is not a passing dark-Preview gate. For Preview, record its expected dark-feature issue codes and use the name/scope audit, build, public health, authentication, and synthetic workflow checks. Do not set production attestations merely to make Preview preflight green.

Preview verification after the gate clears:

1. Push `release/production-v1` and record the automatically created Preview deployment ID/URL.
2. Verify the Preview build is from the application release SHA plus this documentation-only commit.
3. Verify public health, security headers, authentication, checkout, quote, BookingApplication create/resume, and no early Booking.
4. Verify offline payment instruction and Resend request generation with synthetic data.
5. Verify manual review only if the approved non-production Blob/OIDC integration is present; otherwise keep documents dark and record that provider E2E remains blocked.
6. Search build/runtime logs for secret, recipient, database-host, Blob pathname, or customer-data leakage without printing matched values.

## Neon backup and isolated restore plan

Do not execute until the Neon owner supplies and approves the exact project, production branch, pooled runtime URL, direct migration connection, history-retention window, backup destination, RPO, RTO, and recovery owner.

1. Read-only fingerprint the production connection: provider/project ID, branch ID/name, database name, PostgreSQL version, safe host hash, and current migration count. Confirm it is not Preview/development.
2. Record the UTC maintenance checkpoint and stop application/configuration writes.
3. Confirm Neon history retention/PITR covers the approved RPO.
4. Create an isolated child backup branch or approved snapshot at the checkpoint. Record its opaque ID and timestamp. Do not change the production compute endpoint.
5. Where policy permits, create an encrypted native custom-format `pg_dump` with `--no-owner --no-acl`, store it only at the approved encrypted destination, and record its checksum/expiry without committing it.
6. Create an empty isolated restore target. Restore the native archive with `pg_restore --exit-on-error --no-owner --no-acl`, or create a Neon branch from the checkpoint for provider-native rehearsal.
7. Compare migration history and bounded critical table counts, run `prisma migrate status`, start an isolated artifact against the restored target, and verify health with workers/documents disabled.
8. Retain or destroy the restore target according to approved policy. Record owner acknowledgement.

The repository restore script is guarded for `synthetic-only`; it must not be pointed at production customer data under a false attestation. Use it only for a genuinely approved synthetic rehearsal or update the operational tooling in a separately reviewed change.

## Exact production migration and deployment order

Because the old application is not fully write-compatible with migration 33, use this maintenance-window order:

1. Obtain deployment approver, database owner, recovery owner, security/privacy, and business-owner go/no-go.
2. Confirm exact Vercel team/project/domain, exact Neon project/branch, application SHA, previous deployment ID, and rollback owners.
3. Disable/freeze customer BookingApplication/finalization writes and administrator Business Configuration/payment edits. Keep workers and private documents disabled.
4. Verify the Neon backup branch/snapshot and native backup; complete isolated restore evidence.
5. Run read-only `pnpm exec prisma migrate status` using the approved direct migration connection. Stop on unexpected history or drift.
6. Run exactly `pnpm exec prisma migrate deploy`. Do not use `db push`, reset, or manual SQL.
7. Run `pnpm exec prisma migrate status` again and record both pending migration checksums/outcomes.
8. Deploy the exact approved application artifact to the confirmed existing Vercel project. Never link or deploy to `car-rental-documents-nonprod`.
9. Verify public health, protected health, authentication, active configuration, pricing, legal publication, database migration state, and safe logs while writes remain frozen.
10. Run the synthetic quote/BookingApplication/offline-payment/finalization smoke test; verify exactly one Booking and confirmation request behavior.
11. Reopen normal non-document traffic only after mandatory checks pass.
12. Provision/enable production Blob, restricted roles, email delivery, and workers only through their later individual gates and observation windows.

## Rollback checkpoints

| Checkpoint | Required response |
| --- | --- |
| Before backup completion | Stop; make no migration/deployment change |
| After backup, before migration | Stop safely; retain old deployment and remove write freeze only with owner approval |
| Migration failure/inconsistency | Keep writes frozen; preserve evidence; do not improvise SQL; use Neon branch/PITR only with recovery approval |
| Migration succeeds, deployment fails | Keep writes frozen; retry the exact approved artifact or use an explicitly compatible maintenance artifact; do not send legacy payment-configuration writes |
| New deployment health/security failure | Disable new traffic/features and restore the prior deployment only while writes stay frozen; do not reverse additive migrations |
| Data-integrity/authorization/public-Blob incident | Immediate no-go; disable documents/workers, preserve audit evidence, invoke incident/recovery owner |

Database restore is not the default application rollback after successful writes. First determine the exact data-loss interval and obtain recovery-owner approval.

## Dark-launch flags

Initial Production values must keep the following dark until their gates pass:

```text
PRIVATE_DOCUMENTS_ENABLED=false
PHASE8FB_WORKERS_ENABLED=false
PHASE8FB_WORKER_JOBS_ENABLED=
BOOKING_MAINTENANCE_WORKER_ENABLED=false
PRIVATE_DOCUMENT_SCANNER_ENABLED=false
```

The current production preflight requires final fully enabled operations and therefore will report dark-launch blockers at the initial deployment checkpoint. Do not falsify readiness attestations. Use explicit checkpoint-specific acceptance criteria and require the fully enabled preflight only before final customer go-live.

## Remaining inputs and approvals

- Owner confirmation that the candidate team and `car-rental` project ID are the intended customer-owned production project.
- Exact production domain and explanation/approval of the project's reported `live: false` state.
- Read-only Vercel environment-name/scope inventory for Development, Preview, and Production.
- Confirmation that a Git push cannot expose Preview functions to the production Neon branch; otherwise configure safe Preview variables before pushing.
- Approved non-production Neon branch, Preview OAuth origin/callback, synthetic Resend recipient, and optional non-production Blob/OIDC store.
- Exact Neon production project/branch, direct migration method/operator, backup destination, RPO, RTO, retention window, recovery owner, and explicit approval of all 33 migrations.
- Approved maintenance/write-freeze mechanism and window.
- Production sender/domain/key channel, bounce/complaint destination, and alert owner.
- Named restricted-role assignees, legal publication owner, deployment approver, and alert destinations.
- Explicit retention, deletion-grace, same-location, manual-review, offline-payment, and worker-schedule approvals.
- Separate explicit approval of the final production execution plan after all fingerprints are populated.

## Final execution checklist

- [ ] Release branch pushed only after Preview isolation is confirmed.
- [ ] Preview build/health/auth/application/offline-payment verification passes.
- [ ] Exact Vercel project/team/domain approved; non-production document project excluded.
- [ ] Production and Preview environment names/scopes reconciled without displaying values.
- [ ] Exact Neon production identity and migration connection approved.
- [ ] Backup checkpoint and isolated restore meet approved RPO/RTO.
- [ ] Maintenance/write freeze active and acknowledged.
- [ ] Pre-migration status clean; 33 migration checksums approved.
- [ ] Migrations 32–33 applied with `prisma migrate deploy`; post-status clean.
- [ ] Exact approved artifact deployed; previous deployment retained.
- [ ] Public/protected health and synthetic Booking smoke tests pass while writes are frozen.
- [ ] Non-document traffic reopened only after go decision.
- [ ] Blob/OIDC, Resend receipt, roles, alerts, and workers activated only through staged gates.
- [ ] Owner signs GO / CONDITIONAL GO / NO-GO before real customer use.

Current recommendation: **NO-GO for production and conditional NO-PUSH for the release branch until Preview environment isolation is confirmed.**
