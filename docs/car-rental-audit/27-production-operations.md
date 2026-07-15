# Phase 11 — production operations preparation

Date: 2026-07-14. Status: **application operations are prepared; production deployment remains blocked on authenticated infrastructure provisioning and owner sign-off**.

This phase did not deploy the application, migrate or query a production database, connect to live customer systems, enable a production schedule, create online-payment behavior, or process real customer data. Infrastructure mutations were not attempted because the workspace has no `.vercel/project.json`, no authenticated Vercel CLI session, no approved project/team identity, and no production secret source.

## Executive result

- Production readiness score: **86/100**.
- Estimated go-live readiness: **one to two focused business days after an authorized Vercel project, provider credentials, alert destination, recovery owner, and restricted-role assignees are supplied**, followed by the staged validation below.
- Code and dependency position: READY for an authorized production-like infrastructure rehearsal.
- Infrastructure position: NOT READY for deployment because project identity, Blob/OIDC, Resend delivery, drains/alerts, production backup evidence, and real worker heartbeats remain unverified.

## Blockers closed in this phase

1. **One email provider:** SMTP/Nodemailer was removed. `lib/email.tsx` remains the single notification service and now sends only through Resend.
2. **Dependency security:** removing direct Nodemailer and its types removes the vulnerable optional peer installation. `pnpm audit --prod` now reports zero critical, high, moderate, or low vulnerabilities.
3. **Safe provider failures:** Resend errors return a stable delivery failure and operational logs retain only stable event names; provider detail and recipients are discarded.
4. **Recovery tooling:** the partial repository JSON export was removed. PostgreSQL-native custom-format dump/restore verification now checks an isolated target, archive checksum, migration history, and critical table counts.
5. **Health completeness:** the existing protected health report now includes external alert ownership/delivery attestation and fresh backup/restore evidence.
6. **Staged workers:** the existing worker route now requires both the global enable flag and an explicit known-job allowlist. Unknown and not-yet-enabled stages fail closed.
7. **Environment preflight:** a production-only validator reports issue codes without printing values and rejects missing/short/reused secrets, insecure origins, Blob/OIDC gaps, stale recovery evidence, incomplete workers, and online-payment variables.

## Final operational blockers

| Blocker | Evidence required to close | Owner needed |
| --- | --- | --- |
| Vercel project is not linked/authenticated | Explicit project/team link, project settings inventory, plan/region confirmation | Vercel/project owner |
| Private Blob is not provisioned | Private `fra1` store, expected/actual store identity, real synthetic put/head/get/list/delete, no public URL | Blob/privacy owner |
| Runtime OIDC is not verified | Valid deployment-issued `VERCEL_OIDC_TOKEN`, project/environment claim verification, no production static Blob token | Vercel/security owner |
| Resend delivery is not verified | Verified domain/sender, narrowly scoped production key, approved synthetic recipient, received confirmation and failure alert | Email/domain owner |
| External monitoring is absent | Vercel drain or approved monitoring integration, tested alert delivery and escalation | Operations/on-call owner |
| Production backup/restore is not verified | Provider backup within 24 hours and isolated restore within 90 days against approved RPO/RTO | Database/recovery owner |
| Production roles are unnamed | Primary and backup restricted-role assignments with recent-auth tests | Security/privacy owner |
| Production workers are not running | Staged schedules, one successful heartbeat and alert window per stage | Worker/on-call owner |

These are external-state gates. They cannot be truthfully closed with local flags, synthetic tokens, or source changes.

## Operational architecture

The production architecture remains unchanged:

1. Vercel serves the existing Next.js application and injects environment-scoped secrets and short-lived OIDC identity.
2. Route handlers and Server Actions perform server authentication, authorization, rate limiting, validation, and safe logging.
3. Application/domain services own BookingApplication, configuration, pricing, legal, document, retention, deletion, and email decisions.
4. Prisma/PostgreSQL owns transactional consistency, immutable snapshots, audit evidence, rate-limit buckets, and worker heartbeats.
5. The existing private-document storage contract selects the private Vercel Blob adapter in production. Database evidence remains authoritative; Blob contains only private object bytes.
6. `lib/email.tsx` is the only transactional email service and uses Resend only. Business and Confirmation Configuration still determine localized offline instructions and confirmation content.
7. The protected administrator health dashboard aggregates database, configuration, pricing, legal, Blob/OIDC, monitoring, recovery, workers, roles, review, retention, audit, and email readiness. Public health remains liveness-only.
8. External Vercel logs/drains or an approved monitoring integration deliver alerts. The application does not introduce a parallel observability service.

## Production infrastructure

### Vercel project

Required before provisioning:

- Link deterministically with the approved team and project; verify `.vercel/project.json` IDs against the change ticket.
- Confirm Next.js root, Node runtime, production branch, function region relative to PostgreSQL/Blob, Fluid Compute policy, build command, pnpm version, and deployment protection.
- Inventory production variables by name and scope only. Preview deployments must never receive production database, Blob, Resend, OAuth, or worker secrets.
- Build and validate a preview/production-like artifact first. Production promotion remains a separate approved action.

No Vercel resource was created because the CLI reported no credentials and the repository is unlinked.

### Private Blob and OIDC

Production requirements:

- `PRIVATE_DOCUMENT_STORAGE_PROVIDER=vercel-blob-private`
- `PRIVATE_DOCUMENT_ENVIRONMENT=production`
- `PRIVATE_DOCUMENT_BLOB_REGION=fra1`
- matching `PRIVATE_DOCUMENT_BLOB_STORE_ID` and injected `BLOB_STORE_ID`
- private-access and region attestations set only after inspection
- runtime-issued `VERCEL_OIDC_TOKEN`
- no `BLOB_READ_WRITE_TOKEN` in production

After provisioning, run the existing provider harness with synthetic PDF/JPEG/PNG objects. Verify upload grant expiry and limits, checksum, private read, authenticated streaming, list, delete, missing object, retry, legal hold, deletion evidence, and orphan reconciliation. Delete every synthetic object after evidence capture.

### Environment and secrets

Run `pnpm production:preflight` using pulled production environment variables in a controlled session. It prints issue codes only. It validates:

- PostgreSQL URL presence/type;
- exact HTTPS application/Auth.js origins;
- Google OAuth, administrator list, and unique 32+ character auth/rate-limit/worker/cron secrets;
- Resend key format and non-default verified sender;
- private Blob identity, region, OIDC, private-access attestations, and absence of static production Blob credentials;
- alert and recovery owners plus fresh evidence timestamps;
- full worker rollout state;
- absence of Stripe/online-payment variables.

Do not store pulled production variables in tracked files. Local Vercel OIDC tokens expire and are not production evidence.

## Email operations

Resend is the chosen and only production path.

- Removed: direct `nodemailer`, `@types/nodemailer`, SMTP configuration, SMTP-first fallback, and overlapping provider status.
- Retained: the existing email templates, Booking confirmation trigger, localized legal references, configured Confirmation content, immutable offline-payment instructions, safe sender boundary, and health integration.
- Required variables: `RESEND_API_KEY` and `EMAIL_FROM` (or the compatibility `RESEND_FROM_EMAIL`). `EMAIL_FROM` must be a verified sender on the approved domain.
- Delivery verification: send one synthetic confirmation for each of Invoice, Bank Transfer, and Cash at Pickup; verify exactly-once status-transition behavior, localized text, escaped configuration content, provider receipt, bounce/failure visibility, and no PII in logs.

Unit verification proves the Resend request contains the selected offline instructions and that provider error detail is not returned or logged. Actual receipt is blocked until an approved key/domain/recipient exist.

## Monitoring and alerting

### Existing health channels

- Public `/api/health`: database liveness only, `no-store`, safe status body and security headers.
- Protected `/{locale}/admin/health`: full readiness aggregation and no customer/document identifiers.
- Structured logs: stable redacted event names for application, authorization, Blob, email, worker, and unexpected failure paths.
- Database evidence: immutable `AuditEvent` records and bounded `WorkerExecution` heartbeat/outcome rows.

### Required external alerts

Configure an approved Vercel Log/OTel drain or monitoring integration for production runtime and function logs. Test alerts for:

- public health failure and protected health `NOT_READY`;
- Booking/application finalization exceptions and serialization exhaustion;
- authorization denial spikes and recent-auth failures;
- Resend failures/bounces;
- Blob/provider failures, missing objects, checksum/metadata mismatch, and orphan detection;
- missing/stale/failed worker heartbeat;
- review backlog/staleness;
- retention/deletion overdue or repeated failure;
- configuration activation failure;
- database connectivity, backup age, and restore-evidence expiry.

Record `PRODUCTION_ALERTING_ATTESTED=true` and `PRODUCTION_ALERT_OWNER` only after a test notification reaches the primary and backup escalation paths. Vercel Analytics alone is not sufficient error alerting.

## Backup strategy

- Primary recovery source: provider-managed encrypted PostgreSQL backups/PITR with retention, region, encryption, access, and immutability defined by the database owner.
- Secondary release evidence: an encrypted PostgreSQL custom-format archive produced for the change window when policy permits. Never commit an archive or customer export.
- Private document bytes remain in private Blob and are recovered/reconciled under the Blob provider and legal-retention procedure; they are not copied into database backups.
- Record backup ID/time, PostgreSQL version, migration count, encryption/key owner, retention expiry, RPO/RTO, checksum, and restore owner in the approved operations system.
- Set `DATABASE_BACKUP_VERIFIED_AT` only for a successful backup no older than 24 hours and `DATABASE_RESTORE_VERIFIED_AT` only for a successful isolated restore no older than 90 days.

The removed `prisma/backup-data.ts`/`backup.json` path was a partial logical export and is not accepted recovery evidence.

## Restore procedure

1. Obtain incident/change approval and create an isolated, empty PostgreSQL target with no application traffic.
2. Record source backup identity and target identity; never restore over the source or production database.
3. Match supported PostgreSQL tooling/version and establish least-privilege restore credentials.
4. Run the provider restore or `PRODUCTION_RESTORE_REHEARSAL_CONFIRMED=synthetic-only SOURCE_DATABASE_URL=... RESTORE_DATABASE_URL=... pnpm production:verify-restore` for an approved synthetic rehearsal.
5. The verifier refuses identical or non-empty targets, uses `pg_dump`/`pg_restore --exit-on-error`, removes the temporary archive, computes SHA-256, and compares migration/user/Booking/application/audit/document/worker counts.
6. Run `prisma migrate status` against the isolated target. Do not run a production migration during restore verification.
7. Start an isolated application artifact against the restored target and verify health, configuration/pricing/legal resolution, authorization, Booking snapshots, audit, and worker-disabled state.
8. Destroy or retain the isolated target according to the approved evidence/retention policy; rotate temporary credentials.

Disposable evidence in this phase: 33 migrations and synthetic fixture data were dumped and restored into a separate PostgreSQL 16 database. SHA-256 was produced and all selected critical counts matched.

## Worker rollout

Worker execution now requires:

- `PHASE8FB_WORKERS_ENABLED=true`;
- a valid distinct `PHASE8FB_WORKER_SECRET`;
- the job name in `PHASE8FB_WORKER_JOBS_ENABLED`;
- scheduler authorization, shared database rate limiting, and a known job route.

Staged order:

1. `review-backlog`
2. `stale-review`
3. `application-expiry`
4. `abandoned-upload-cleanup`
5. `retention-processing`
6. `orphan-reconciliation`
7. `deletion-processing`
8. `failed-deletion-retry`
9. booking-maintenance cancellation separately through `BOOKING_MAINTENANCE_WORKER_ENABLED` and `CRON_SECRET`

At each stage, enable only the cumulative allowlist, invoke with synthetic/no-op data, require a successful `WorkerExecution` heartbeat and expected `AuditEvent`, prove missing-heartbeat/failure alert delivery, and observe one agreed interval before advancing. Deletion and retry require privacy/legal approval. Do not place all jobs on a schedule at once.

Synthetic production-build evidence: `application-expiry` outside the allowlist returned `403 WORKER_DISABLED_OR_DENIED`; `review-backlog` inside the first-stage allowlist returned `200`, stored a completed `SUCCEEDED` execution, and stored `document.review_backlog_observed` audit evidence.

No production schedule or worker was enabled because there is no authenticated linked Vercel project or approved live database.

## Production validation checklist

- [x] Resend is the only application email provider.
- [x] Production dependency audit is zero across all severities.
- [x] Resend request/offline-instruction rendering and safe failure behavior pass synthetic tests.
- [x] PostgreSQL dump/restore verifier passes against isolated disposable databases.
- [x] Health includes monitoring, backup/restore, staged workers, and existing readiness domains.
- [x] Staged worker deny/success, heartbeat, and audit behavior pass against disposable infrastructure.
- [ ] Approved Vercel project/team linked and settings inventoried.
- [ ] Private production Blob provisioned and provider harness passed with synthetic objects.
- [ ] Runtime OIDC claims/store identity verified; no static production Blob token.
- [ ] Production environment preflight returns `ready: true` without values being printed.
- [ ] Resend domain/sender/key configured and synthetic confirmation received.
- [ ] External drain/integration and every critical alert tested end-to-end.
- [ ] Provider backup and isolated production-like restore meet RPO/RTO.
- [ ] Restricted primary/backup roles assigned and recent-auth verified.
- [ ] All worker stages enabled gradually with successful heartbeats and alerts.
- [ ] Protected health dashboard is `READY` under an authenticated administrator.
- [ ] Synthetic Booking confirmation contains the immutable selected offline instructions and one confirmation is received.
- [ ] Launch commander signs the deployment and rollback evidence.

## Deployment readiness and stop boundary

When the blockers are closed, the next authorized phase should:

1. link and inventory the exact Vercel project;
2. provision Blob/OIDC and scoped secrets without deployment;
3. prove provider, email, drain, backup/restore, and owner evidence;
4. build a production-like artifact and run the full preflight;
5. obtain explicit go/no-go approval;
6. only then perform the separately authorized production migration and artifact promotion.

This phase stops before steps 5–6. No production deployment or production database migration is authorized.

## Remaining operational risks

- Confirmation email is still post-transaction and has no transactional outbox. Booking consistency is preserved on failure, but retry/deduplication remains an operational procedure.
- Auth.js remains a v5 beta and Prisma 5.22 remains behind the current major; upgrade them only in separate rehearsals.
- Repository-wide ESLint retains its inherited findings outside the scoped production operations files.
- Vercel plan, function region, drain availability, scheduler limits, Blob private-access status, and provider backup guarantees are unknown until the approved project is linked.
- Self-attestation variables are readiness evidence pointers, not proof by themselves. Operators must retain the underlying provider/alert/restore evidence.
- Worker operations are idempotent/optimistic but do not use a global lease. Monitor overlapping scheduler delivery before adding coordination.

## Validation evidence

- Prisma schema validation/client generation: PASS; all 33 disposable migrations are current.
- TypeScript and scoped operations ESLint: PASS.
- Vitest: PASS; 43 files and 284 tests.
- Production build: PASS; 65 pages generated.
- Production dependency audit: PASS; zero vulnerabilities.
- Production preflight: PASS with a complete synthetic environment; the real production environment remains unavailable.
- `git diff --check`: PASS.
- Repository-wide ESLint: inherited baseline remains 30 errors and 27 warnings; no scoped operations finding was added.
- Disposable PostgreSQL migration and restore: PASS; all 33 migrations and critical counts restored.
- Staged worker execution/audit: PASS against disposable infrastructure.
- Vercel authentication/project inventory: BLOCKED; no CLI credentials or project link.
- Real Blob/OIDC, Resend receipt, alerts, provider backup, and production worker heartbeat: BLOCKED pending approved infrastructure.
