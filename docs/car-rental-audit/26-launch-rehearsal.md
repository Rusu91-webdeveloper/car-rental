# Phase 10 — launch rehearsal and operational validation

Date: 2026-07-14. Status: **synthetic rehearsal passed; controlled production launch remains blocked on external provisioning, ownership, and recovery sign-off**.

This rehearsal used disposable PostgreSQL databases and synthetic records only. It did not connect to a production database, provision or access a production Blob store, enable a production worker, deploy an application, send customer data, or add online payment behavior.

## Executive result

- Launch readiness score: **82/100**.
- Engineering result: the existing application, configuration, pricing, legal, document, booking-finalization, offline-payment, email, worker-evidence, and audit boundaries operate as one coherent architecture in the exercised paths.
- Three integration defects were found and corrected: the completed Documents workflow step was still marked unavailable, a notification edit could reuse a stale draft left by a losing concurrent activation attempt, and parallel rendering could race while creating the singleton company-settings row.
- Launch decision: **NO-GO until every critical gate below has an owner and evidence**. No production action is authorized by this report.

### Critical launch blockers

1. Choose and test either Nodemailer 9 SMTP or Resend-only delivery. The current Nodemailer 6 dependency retains security advisories and does not satisfy Auth.js's declared Nodemailer peer range.
2. Approve and provision the private production Blob store and workload OIDC identity, then pass the existing provider harness with synthetic files. Static tokens are prohibited in production.
3. Assign named primary and backup owners for document review, document security, retention/deletion, workers, alerts, release activation, database recovery, and launch command.
4. Create an approved database backup and prove restoration into an isolated environment against documented RPO/RTO targets.
5. Configure an external alert destination and prove delivery for application, worker, email, Blob, review, retention, deletion, authorization, and unexpected-failure signals.

### Warnings

- Auth.js is still a v5 beta and Prisma 5.22 is behind the current major; upgrades require separate rehearsals.
- Confirmation email is sent after the Booking status transaction and has no transactional outbox. A provider failure does not corrupt the Booking, but retry/duplicate-delivery policy remains operational.
- Repository-wide ESLint has inherited findings outside this phase; scoped Phase 10 lint must remain clean.
- Worker operations are idempotent/optimistic, but there is no global single-flight lease. Monitor duplicate scheduler delivery before deciding whether one is needed.
- Public health is intentionally database-liveness-only. Full readiness is available only on the administrator dashboard.

## Rehearsal infrastructure and evidence

Three disposable PostgreSQL 16 databases were created for independent migration and scenario runs:

| Database | Purpose | Result |
| --- | --- | --- |
| `phase10_rehearsal` | Full BookingApplication, quote, legal, payment, finalization, and snapshot flow | PASS |
| `phase10_concurrency` | Pricing rollback and overlapping Booking creation | PASS |
| `phase10_configuration` | Business release activation, race behavior, audit, and notification configuration | PASS |

All 33 migrations replayed from zero on each relevant database. No production credentials or data were used. Document-provider lifecycle behavior was exercised with synthetic bytes through the storage contract and unit/integration doubles; a real Vercel Blob call was intentionally not made because no approved non-production provider credentials were supplied.

## End-to-end business workflow

| Transition or invariant | Evidence | Result |
| --- | --- | --- |
| Customer starts/resumes an application | Application fixture and service tests cover owner-bound create/resume and persisted state | PASS |
| Vehicle/date selection and quote | Current pricing is resolved; unconfirmed and expired quote paths reject; renewed quote supersedes the old version | PASS |
| Customer/driver and insurance selection | Version-bound selections persist and are consumed by finalization | PASS |
| Legal acceptance | Published validated documents, version IDs, hashes, locale, and acceptance evidence persist | PASS |
| Offline payment selection | Bank Transfer selection points to the exact localized instruction row | PASS |
| Document upload/resume/review | Intent/session validation, owner isolation, completion idempotency, scanner/provider evidence, manual review, rejection, replacement, and approval tests pass | PASS |
| Booking finalization | Serializable transaction creates exactly one Booking under concurrent calls | PASS |
| Immutable snapshots | Pricing, customer/driver, insurance, legal, configuration, and payment-instruction snapshots persist atomically | PASS |
| Confirmation composition | Existing single email service renders localized confirmation content and the snapshotted offline instruction when the Payment section is enabled | PASS |
| Confirmation provider failure | Missing provider configuration returns a safe failure; Booking data remains unchanged and logs contain no recipient/provider detail | PASS |
| Audit evidence | Activation, denial, configuration, review, application, and lifecycle paths retain audit/evidence records | PASS |
| Retention and deletion | Hold, due discovery, deletion, retry, and evidence behavior pass service/adapter tests with synthetic objects | PASS (contract) |
| Actual email receipt | Requires approved provider/domain and test recipient | BLOCKED |
| Actual private Blob lifecycle | Requires approved non-production or production-like Blob/OIDC provisioning | BLOCKED |

No early Booking is created during application entry. Finalization consumes the application session and the finalized application is immutable. The Payment section controls whether the snapshotted instruction is included; configuration does not reach back and alter an in-flight application's evidence.

## Negative-scenario matrix

| Scenario | Expected containment | Result |
| --- | --- | --- |
| Unavailable/overlapping vehicle | One writer succeeds; competing writer rejects/rolls back without partial Booking | PASS |
| Expired application | Status becomes `EXPIRED`; later mutation/finalization rejects | PASS |
| Quote expiration/unconfirmed quote | Finalization rejects; quote renewal creates a new immutable version | PASS |
| Concurrent finalization | Exactly one Booking; callers converge on the same result or receive a safe conflict | PASS |
| Document rejection and replacement loop | Append-only decisions and replacement lineage remain; rejected content is not accepted | PASS |
| Expired upload session | Completion rejects; no document is incorrectly promoted | PASS |
| Duplicate application/finalization request | Correlation/idempotency and ownership prevent duplicate authoritative results | PASS |
| Configuration changes during application | Application remains bound to its captured release and immutable versions | PASS |
| Inactive release | Runtime resolution and activation checks reject it | PASS |
| Missing legal publication | Validation/finalization rejects without removing evidence | PASS |
| Missing pricing/vehicle/currency/calendar | Resolution rejects; transaction rolls back | PASS |
| Role violation | Exact restricted capability and owner checks deny access and retain bounded audit evidence | PASS |
| Recent-auth failure | Sensitive document operations fail closed | PASS |
| Worker interruption | Route records bounded `FAILED` execution evidence and a safe failure code; implementation/unit evidence verified | PASS (code path) |
| Blob unavailable/transient scanner failure | Adapter/service records safe failure state and preserves retryable lifecycle evidence | PASS (contract) |
| Database failure/serialization conflict | No partial snapshot/Booking/release activation persists | PASS |
| Email delivery failure | Booking remains consistent; safe event only, no address/message/provider exception in logs | PASS |

Sensitive identifiers, Blob paths, document payloads, recipient addresses, tokens, and provider exception text are intentionally excluded from worker and email operational evidence.

## Administrator and operational validation

| Surface | Validation | Result |
| --- | --- | --- |
| Business Configuration and release activation | Validation/blocker behavior, expected revision, unauthorized activation, supersession, and concurrent exactly-one activation | PASS |
| Pricing, insurance, customer requirements, workflow, legal | Representative current-schema release validates and activates; completed Documents step is accepted | PASS |
| Offline payment and confirmation configuration | Existing active release is cloned through the same domain; Invoice, Bank Transfer, and Cash at Pickup remain the only editable modes; localized content validates | PASS |
| Stale notification draft after activation race | New edit rebases from the current ACTIVE release rather than the losing stale draft | PASS |
| Singleton company settings initialization | Public read path no longer mutates the database; absent settings use the same safe defaults without parallel-render conflicts | PASS |
| Booking/document review | Server authorization, decision/replacement state, and evidence tests pass | PASS |
| Audit and worker status | Database models and protected health aggregation use bounded operational records | PASS |
| Health dashboard | Authorization, readiness aggregation, and safe data-shape tests/build pass | PASS (local) |
| Role assignment | Bootstrap tooling and exact capabilities exist | BLOCKED — named production assignees absent |
| Retention/deletion queue | Query/service behavior and health aggregation exist | PASS (local); production owner/schedule blocked |
| Email configuration | Provider configuration can be assessed without sending | PASS (local); delivery blocked |

## Production-readiness review

### Environment and secrets

- Require unique production values for `DATABASE_URL`, `NEXTAUTH_SECRET`, Google OAuth, `ADMIN_EMAILS`, `RATE_LIMIT_HASH_SECRET`, application origin, email provider, and independent worker secrets.
- Keep private-document and worker enable flags off until their individual gates pass.
- Never place `BLOB_READ_WRITE_TOKEN` in production. Use the approved workload OIDC identity and attest expected store ID, private access, and region.
- Confirm secrets are absent from source, build output, logs, screenshots, and support artifacts.

### Database and migrations

- PostgreSQL constraints, serializable transactions, row/advisory locks, immutable snapshots, and compound uniqueness remain the consistency boundary.
- Migrations are additive and replay from an empty database. Production down-migration is not the rollback strategy.
- Before launch, verify backup, restore, connection pooling/TLS, migration credentials, migration duration, and free capacity on production-like infrastructure.

### Email, Blob, OIDC, and workers

- Email continues through `lib/email.tsx`; no parallel notification service or online-payment integration exists.
- Blob remains behind the private-document storage contract. Production must attest private access, region, store identity, OIDC, checksum, size limits, grant expiry, secure streaming, list/delete, and orphan behavior.
- Workers fail closed when disabled or when their secret is missing/wrong. Enable only after heartbeat monitoring, alerts, cadence, retry, timeout, batch, concurrency, and escalation are approved.

### Health, logging, security, and authorization

- Public `/api/health` is a minimal no-store database liveness response. The dynamic administrator dashboard performs full readiness checks.
- Structured logs redact sensitive keys and email/provider detail. Audit and worker records are bounded.
- Security headers, restrictive caching, server-side authorization, owner isolation, recent authentication, constant-time worker-secret checks, and database-backed rate limiting remain in force.

## Controlled deployment sequence

1. Name the launch commander and primary/backup owners; approve the go/no-go evidence template and change window.
2. Resolve the email dependency decision, configure the approved provider/domain, and prove synthetic delivery plus failure alerting.
3. Approve Blob region/private access/cost/legal policy; provision OIDC and run the synthetic provider harness.
4. Prove database backup restoration in isolation and approve RPO/RTO. Record current application artifact and migration state.
5. Validate production environment variables without printing values. Keep private documents and all worker flags disabled.
6. Run `prisma validate`, `prisma generate`, `prisma migrate status`, then `prisma migrate deploy` with dedicated migration credentials.
7. Deploy the verified application artifact. Do not enable document traffic or schedules.
8. Verify public health, security headers, authentication, administrator authorization, active configuration, published pricing/legal content, and protected health.
9. Assign and test restricted roles, including recent reauthentication. Run a synthetic quote/application without identity documents.
10. Run a synthetic private-document upload/review/replacement/approval/deletion lifecycle. Verify no public object URL and confirm audit/health/alerts.
11. Finalize one synthetic Booking concurrently, verify exactly one Booking and all immutable snapshots, transition it to confirmed, and confirm receipt of localized offline-payment instructions.
12. Enable document traffic only after the document/security/privacy owners sign off.
13. Enable workers in the order below, observing at least one successful heartbeat and alert window between stages.
14. Complete the concise checklist and obtain launch commander, security/privacy, operations, database, and business-owner approval.

## Worker activation order

1. Review backlog observation and stale-review detection (read/mark operational evidence first).
2. Application expiry.
3. Abandoned upload cleanup.
4. Retention due discovery/processing after retention owner approval.
5. Orphan reconciliation after Blob list/read evidence passes.
6. Deletion processing after legal-hold and privacy-owner approval.
7. Failed-deletion retry last, with alerting and a bounded maximum-attempt escalation.
8. Enable booking-maintenance cancellation separately after its secret, cadence, and business-owner policy are confirmed.

Never activate the next stage while health is red, a prior execution is stale/failed without explanation, or alert delivery is unverified.

## Rollback and emergency sequence

1. Declare the incident, freeze configuration activation, and record time, artifact, release ID, migration state, and owner.
2. Disable new document entry points and every worker flag. Stop deletion first. Preserve all database and provider evidence.
3. If email is implicated, disable the provider credential/path and retain Booking status/evidence; do not resend blindly.
4. Route application traffic to the previously verified artifact. Do **not** reverse database migrations automatically.
5. If configuration caused the incident, activate a corrected/superseding release only through the existing workflow; never mutate ACTIVE history.
6. If Blob is implicated, stop upload/delete, retain legal holds, rotate compromised identity, and reconcile database-to-provider state before action.
7. Restore the database only under the approved recovery procedure after proving the target point and preserving incident evidence.
8. Verify public/admin health, authorization, active release, audit persistence, Booking consistency, Blob containment, and worker-disabled state.
9. Communicate status and recovery criteria. Re-enable services in the controlled deployment order only after explicit go-ahead.

## Recovery checklist

- [ ] Incident commander and technical/privacy/security owners assigned.
- [ ] Scope, first-known time, artifact, release, migrations, credentials, and affected workflows recorded.
- [ ] Destructive workers and new document intake disabled; evidence/legal holds preserved.
- [ ] Database integrity checks and isolated restore completed against approved RPO/RTO when needed.
- [ ] Blob inventory reconciled without exporting private content.
- [ ] Exposed credentials rotated and sessions invalidated where required.
- [ ] Corrected artifact/release tested with synthetic data.
- [ ] Health, alerts, audit, email, and worker heartbeat verified before staged recovery.
- [ ] Post-incident review and follow-up owners recorded.

## Role-assignment checklist

- [ ] Launch commander and backup.
- [ ] Business Configuration activator and backup; separate reviewer where policy requires.
- [ ] Pricing/legal publishers and approvers.
- [ ] `DOCUMENT_REVIEWER` primary and backup.
- [ ] `DOCUMENT_SECURITY_ADMIN` primary and backup.
- [ ] `DOCUMENT_RETENTION_OPERATOR` primary and backup.
- [ ] Temporary downloader/incident access only for named, time-bounded need.
- [ ] Database migration/restore owner and backup.
- [ ] Worker/alert on-call owner and escalation.
- [ ] Email/domain owner and Blob/OIDC owner.
- [ ] Privacy/legal decision owner for hold, retention, and deletion exceptions.
- [ ] Every sensitive role tested with recent Google authentication and least privilege.

## Blob and OIDC verification

- [ ] Approved project, private store, region, cost owner, retention policy, and expected store ID recorded.
- [ ] Runtime has workload OIDC; production has no static Blob read/write token.
- [ ] Store identity, private-access attestation, and region attestation match configuration.
- [ ] Synthetic PDF/JPEG/PNG upload passes expiry, size, checksum, content validation, and owner isolation.
- [ ] Browser never receives a reusable provider read URL; server streaming is no-store and authenticated.
- [ ] Synthetic read/list/delete, missing object, timeout/retry, failed deletion, and orphan reconciliation pass.
- [ ] Legal hold blocks deletion and evidence contains no object content/path leakage.

## Health and smoke verification

- [ ] Public health returns only safe healthy/unhealthy state with `no-store`.
- [ ] Administrator health requires an active administrator and shows database, configuration, pricing, legal, Blob/OIDC, workers, roles, review, retention/deletion, audit, and email readiness.
- [ ] Security headers and sensitive-response cache headers are present.
- [ ] Sign-in/out, inactive-user denial, owner isolation, restricted-role denial, and recent-auth denial pass.
- [ ] Public browsing and synthetic quote pass.
- [ ] Synthetic application can be refreshed/resumed with no early Booking.
- [ ] Rejection, replacement upload, approval, concurrent finalization, and exact immutable snapshots pass.
- [ ] Synthetic confirmation is received once with the selected localized offline instruction.
- [ ] Rate-limit `429`/`Retry-After`, safe logs, audit persistence, worker heartbeat, and alert delivery pass.

## Concise production checklist

- [ ] Database backup and isolated restore verified.
- [ ] All migrations applied and status clean.
- [ ] Exactly one ACTIVE validated Business Configuration release.
- [ ] Released pricing and required currency/calendar data verified.
- [ ] Required legal documents validated, published, and active.
- [ ] Email dependency decision complete; provider/domain and synthetic receipt verified.
- [ ] Private Blob store and OIDC verified; no production static token.
- [ ] Restricted roles and primary/backup owners assigned.
- [ ] Protected health dashboard green and public health safe.
- [ ] External alerts received; worker schedules still disabled before approval.
- [ ] Synthetic BookingApplication, document approval/replacement, concurrent finalization, and one Booking passed.
- [ ] Offline payment instruction and confirmation content snapshot verified.
- [ ] Audit, retention, legal hold, deletion, retry, and recovery evidence verified.
- [ ] RPO/RTO, emergency rollback, escalation, and owner handover signed.
- [ ] Launch commander explicitly authorizes staged worker/document enablement.

## Owner handover

- [ ] Record artifact digest/commit, migration list, active release ID, legal/pricing versions, environment owner, and change window.
- [ ] Hand over dashboards, alert routes, worker cadences, secrets-rotation procedures, provider consoles, and audit queries without copying secrets.
- [ ] Confirm primary/backup contacts and response targets for business, engineering, database, security, privacy/legal, Blob, email, and customer support.
- [ ] Review known warnings, email retry semantics, deletion escalation, Blob containment, database restore, and configuration supersession.
- [ ] Schedule the first heartbeat/review-backlog/deletion review and the next restore rehearsal.
- [ ] Store signed go/no-go and smoke evidence in the approved operational system.

## Operational recommendations

1. Treat the five critical blockers as hard gates; do not convert provider/unit evidence into production sign-off.
2. Keep the existing email service and versioned Business/Confirmation Configuration paths. Do not add a second sender, online-payment path, or mutable Booking instructions.
3. Resolve email dependency/security before launch and document idempotent retry handling; consider an outbox only as a separately approved reliability project.
4. Establish alert delivery and owner escalation before any schedule. Watch duplicate invocations before adding a distributed worker lease.
5. Plan Auth.js, Prisma, and inherited lint remediation independently from launch so upgrades do not expand the launch change set.
6. Re-run this rehearsal on production-like infrastructure after Blob/OIDC, email, backup/restore, and named owners exist, then obtain explicit deployment approval.

## Validation evidence

- Prisma schema validation and client generation: PASS.
- Migration replay/status: PASS; 33 migrations applied from zero and `prisma migrate status` reports the disposable rehearsal database up to date.
- TypeScript: PASS.
- Vitest: PASS; 41 files and 279 tests.
- Production build: PASS; 65 pages generated. A clean-database rerun produced no singleton-settings conflict after the read-path fix.
- Scoped ESLint for Phase 10 implementation/tests: PASS.
- Repository ESLint: inherited baseline remains 30 errors and 27 warnings; no Phase 10 scoped finding.
- Graphify: PASS; 3,553 nodes, 7,931 edges, no missing/dangling endpoints, exact duplicates, or same-endpoint collapse groups.
- `git diff --check`: PASS.
- Local production-artifact smoke test: public health returned `200 {"status":"healthy"}` with `no-store` and security headers; a disabled/unauthorized worker call returned safe `403 WORKER_DISABLED_OR_DENIED`; unauthenticated protected health rendered the sign-in/unauthorized boundary without operational data.

No deployment, production resource creation, production database access, worker activation, or online-payment work was performed.
