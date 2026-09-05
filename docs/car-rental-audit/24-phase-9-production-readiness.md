# Phase 9 — production readiness

Date: 2026-07-14. Status: **engineering hardening complete; production launch is blocked on the explicit decisions and provisioning gates below**.

This phase did not implement online payment, change rental rules or legal wording, contact production services, provision a Blob store, enable a schedule, or remove historical evidence.

## Executive result

- Production readiness score: **79/100**.
- Estimated deployment readiness: **2–4 focused engineering days after the critical decisions are approved**, followed by a production-like launch rehearsal and owner sign-off.
- Remaining critical blockers: the Nodemailer/Auth.js dependency decision; approved private production Blob/OIDC provisioning; production worker/role/alert ownership and a deletion rehearsal.
- Remaining medium risks: Auth.js remains a v5 beta; Prisma 5.22 requires a separately planned major upgrade; repository-wide ESLint remains at its inherited baseline; no external alert destination is configured. Booking lifecycle emails now use a transactionally-created retryable outbox.
- Remaining low risks: duplicate transitive UI packages remain; worker overlap is safe through idempotent operations but does not yet have a single-flight lease; the public health endpoint is liveness-only by design.
- Technical debt: inherited UI lint findings, legacy manual-payment terminology/schema fields, old setup documents, and mixed formatting conventions.

## Architecture review

The architecture remains a Next.js App Router application with server-owned domain and persistence boundaries. Business Configuration, pricing, legal, BookingApplication, private-document lifecycle, and Booking finalization continue to use their existing application/repository boundaries. Prisma remains the infrastructure adapter. No microservice or parallel architecture was added.

The refreshed Graphify corpus contains 3,475 nodes and 7,739 edges across 477 source/evidence files. It reports no import cycles and no collapsed duplicate endpoint edges. The affected-node review for `enforceRateLimit` shows only Server Actions, protected route handlers, private-document streaming, and tests as consumers. No client component imports Prisma, server authorization, production health, or private-document infrastructure.

Dependency direction remains:

1. App Router pages, Server Actions, and Route Handlers authenticate and validate input.
2. Application/domain services enforce lifecycle and authorization rules.
3. Repository adapters own persistence and transactions.
4. Private storage is accessed only behind the existing storage contract.

The obsolete exported `createBooking` Server Action was removed. It was not used by the UI and could bypass the BookingApplication/document-review lifecycle. Booking creation now has one authoritative path: serializable BookingApplication finalization with application and vehicle locks, fresh price/availability/configuration checks, snapshots, document bindings, and idempotent convergence.

## Dependency review

`pnpm audit`, `pnpm outdated`, `pnpm why`, peer output, and the lockfile were reviewed. The starting audit contained 47 advisories: 1 critical, 16 high, 26 moderate, and 6 low. Phase 9 made only same-major upgrades or targeted same-major resolutions:

| Package | Before | After | Decision |
| --- | ---: | ---: | --- |
| Next.js | 16.0.10 | 16.2.10 | Security-required same-major upgrade. |
| React / React DOM | 19.2.0 | 19.2.7 | Security patch. |
| eslint-config-next | 16.0.10 | 16.2.10 | Kept aligned with Next.js. |
| next-intl | 4.6.1 | 4.13.2 | Same-major security update. |
| @auth/prisma-adapter | 2.11.1 | 2.11.2 | Patch update. |
| @vercel/blob | 2.4.0 | 2.6.1 | Same-major provider update; adapter contract tests retained. |
| PostCSS | 8.5.6 | 8.5.19 | Security patch. |
| React types | 19.2.7 | 19.2.17 | Patch update. |

Targeted pnpm resolutions remove vulnerable transitive `fast-xml-parser`, `lodash`, `picomatch@2`, `postcss`, and `qs` versions. The unused direct dependencies `@neondatabase/serverless`, `i18`, `immer`, `prettier`, `stripe`, and `use-sync-external-store` were removed. The dormant Stripe module and commented webhook implementation were removed; the endpoint continues to return `410` with `no-store`. Payment remains out of scope.

The post-hardening audit has no critical advisories. Its remaining advisories are all attributable to direct `nodemailer@6.10.1`; two are high, six moderate, and one low. Auth.js also declares `nodemailer@^7.0.7`, so the current version has an unmet peer. Resolving every advisory requires a Nodemailer major upgrade (the highest advisory requires `>=9.0.1`) or removal of SMTP support. Per the phase rule, neither risky change was made automatically. **Production is blocked until the owner chooses and tests either (a) Nodemailer 9 SMTP or (b) Resend-only delivery and removes Nodemailer.** Relevant upstream evidence includes the [Next.js security advisories](https://github.com/vercel/next.js/security/advisories), [Auth.js email misdelivery advisory](https://github.com/advisories/GHSA-5jpx-9hw9-2fx4), and [Nodemailer repository/releases](https://github.com/nodemailer/nodemailer).

Major upgrades intentionally deferred:

- Prisma/client 5.22 → 7.x: migration/runtime/config changes require a dedicated rehearsal.
- Zod 3 → 4, Recharts 2 → 3, React Day Picker 9 → 10, and other UI majors: no Phase 9 security need justified architectural churn.
- Auth.js v5 beta → a future stable line: requires session/OAuth/regression review.

Duplicate transitive packages remain where packages require different ranges (`@auth/core`, Radix primitives, Node types, `debug`, `ms`, `postcss`, `react-is`, and `semver`). No duplicate application runtime was introduced.

## Security review

### Authentication and authorization

- Proxy authentication is defense-in-depth only. Every privileged page, Server Action, and Route Handler rechecks active database identity, administrator role, capability, exact document policy, or worker bearer authorization on the server.
- Restricted document capabilities remain unavailable to `ADMIN`/`ADMIN_COMPAT` without an explicit `DOCUMENT_*` role.
- Customer application/document access is owner-scoped in server repositories. Browser-supplied ownership, release, price, readiness, Blob location, and capability claims are ignored.
- Production no longer receives the development fallback administrator email. `ADMIN_EMAILS` must be explicitly configured.
- The Cloudinary signing route is administrator-only and signs only the server-configured folder; it no longer trusts a browser-provided folder.
- Worker secrets and cron secrets fail closed when absent and are compared in constant time. Both worker families also require an explicit enable flag.

### Server Actions, route handlers, CSRF, replay, and caching

- Auth.js uses restrictive cookies and CSRF protection for its POST routes. Patched Next.js Server Action origin/CSRF handling is in use. SameSite authenticated cookies plus server authorization protect application mutation routes.
- BookingApplication creation has a caller-provided correlation key but database-owned idempotency and owner binding. Finalization, uploads, review decisions, deletion requests, scanner/provider evidence, and worker maintenance retain their existing idempotency keys or optimistic revisions.
- Sensitive responses use `private, no-store`; public health, disabled payment, and worker denial responses use `no-store`. Document streaming retains `no-store`, `nosniff`, safe disposition, and no provider redirect.
- Global headers now include `nosniff`, frame denial, strict referrer policy, restricted browser permissions, same-origin opener/resource policy, and production HSTS.
- Public health returns only `healthy`/`unhealthy`; it no longer exposes timestamps, exception text, database product details, or configuration.

### Concurrency and transaction integrity

- Business release activation retains its advisory transaction lock, row lock, expected revision, serializable isolation, and atomic audit event.
- authoritative Booking creation and BookingApplication finalization retain serializable transactions, `FOR UPDATE` locks, availability conflict constraints, current quote/configuration checks, immutable snapshots, and exactly-one Booking convergence.
- document review/legal hold/deletion retain row locks or expected revisions and append-only evidence.
- shared rate-limit increments use the PostgreSQL compound unique key and atomic upsert. A database failure fails the protected operation closed.

### Data exposure and logging

- Rate-limit subjects are HMAC-SHA-256 values; raw user IDs are not stored in operational counters. Production requires a dedicated `RATE_LIMIT_HASH_SECRET`.
- Email logs now emit only stable event names. Recipients, provider message IDs, customer names, booking email data, SMTP details, and provider exception messages are discarded.
- The structured logger redacts sensitive keys and reduces `Error` objects to their class name.
- Worker execution evidence contains job, bounded counts, status, timestamps, and safe failure codes only. It excludes customer/document IDs, Blob paths, payloads, tokens, and credentials.
- The health dashboard exposes operational status and aggregate counts only.

## Rate limiting review

The temporary process-local `Map` was replaced by an atomic PostgreSQL fixed-window limiter. PostgreSQL is already required, shared by all instances, transactionally atomic, deterministic, horizontally usable by server functions, and adds no vendor or paid service. Indexed expired buckets are removed after a 24-hour safety margin. Existing policies and public `429`/`Retry-After` behavior are preserved.

This choice avoids a new cache service. Revisit only if measured rate-limit traffic materially affects the primary database; that is not a launch prerequisite.

## Worker review

The Phase 8F-B worker endpoint covers application expiry, abandoned upload cleanup, review backlog, stale review, retention processing, deletion processing, failed-deletion retry, and orphan reconciliation. Batch sizes remain bounded (25–100 depending on operation). Existing repository operations are idempotent or optimistic; provider retrieval/list operations have bounded retry behavior; deletion requests and attempts preserve evidence.

Phase 9 adds a `WorkerExecution` heartbeat for start, success, failure, bounded counts, and safe failure code. Failed executions remain visible to health/monitoring. Rate limiting is shared. Unknown jobs, disabled jobs, missing/incorrect secrets, and failures return safe responses.

The booking-maintenance cron previously allowed calls when `CRON_SECRET` was absent. It now fails closed and requires `BOOKING_MAINTENANCE_WORKER_ENABLED=true`.

No production schedule was created or enabled. Before enablement, owners must choose cadence, alert thresholds, timeout, retry policy, concurrency policy, and deletion escalation. A stale `RUNNING` lease/single-flight mechanism is a low-risk follow-up if overlapping scheduler delivery is observed; current operations remain idempotent.

## Monitoring review

Production monitoring now has three evidence channels:

1. structured safe runtime events for Booking/application/email/worker/unexpected failures;
2. immutable database `AuditEvent` evidence for activation, authorization denials, Booking/document lifecycle, access, review, retention, deletion, Blob/provider failures, and backlog observation;
3. `WorkerExecution` heartbeat and bounded outcome evidence.

The dashboard reports Booking infrastructure indirectly through database/configuration/pricing/audit and reports application/document failures through worker, review, retention, Blob, and audit checks. Email configuration is checked without sending a message.

An external alert destination was not provisioned because that changes production infrastructure and may be paid. Before launch, route structured log/audit/heartbeat signals to the approved platform and configure alerts for Booking/application exceptions, activation failures, unauthorized access, review age/count, provider failures, deletion/retention failures, email failures, missing worker heartbeat, and unexpected exceptions.

## Health dashboard review

`/{locale}/admin/health` requires an active administrator in the Server Component and is always dynamic. It verifies:

- database query;
- one active validated configuration release;
- released validated pricing with at least one rate;
- validated published rental terms and privacy notice;
- private Blob store identity/private/region/static-token attestations;
- runtime OIDC availability;
- successful worker heartbeats within 24 hours;
- explicit reviewer, security, and retention assignments;
- pending/stale review aggregate;
- overdue retention/deletion aggregate;
- recent audit persistence;
- email provider configuration without delivery.

The public `/api/health` remains intentionally limited to database liveness so it is safe for an unauthenticated load balancer.

## Repository cleanup

Removed genuine dead or risky code only:

- obsolete direct Booking creation Server Action;
- dormant Stripe SDK module and commented payment webhook implementation;
- unused direct packages listed in the dependency section;
- browser-controlled Cloudinary folder signing.

No historical Booking, payment, legal, configuration, document, review, deletion, or audit schema evidence was removed. The user’s pre-existing `configuration-issue-list.tsx` change was preserved.

## Production checklist

### Deployment

- [ ] Approve the Nodemailer 9 versus Resend-only decision; implement and run email integration tests.
- [ ] Pin Node.js 20.9 or newer and pnpm version in CI/runtime.
- [ ] Create a production database backup and verify restore into an isolated database.
- [ ] Run `prisma migrate deploy` before application traffic; confirm all 32 migrations including Phase 9.
- [ ] Deploy with private documents and workers disabled.
- [ ] Verify public health, authentication, administrator access, and the protected health dashboard.
- [ ] Assign restricted roles, provision Blob/OIDC, rehearse synthetic upload/review/deletion, then explicitly enable document traffic.
- [ ] Enable worker schedules only after alert delivery and owner escalation are live.

### Secrets and environment

- [ ] `DATABASE_URL` uses pooled TLS production connectivity with a separately controlled migration path.
- [ ] `NEXTAUTH_SECRET`, Google OAuth credentials, `ADMIN_EMAILS`, and `RATE_LIMIT_HASH_SECRET` are unique production secrets.
- [ ] `NEXT_PUBLIC_APP_URL`/`NEXTAUTH_URL` are exact HTTPS origins.
- [ ] Configure exactly the approved email provider and verified sender/domain.
- [ ] Configure Cloudinary credentials/folder only if administrator vehicle uploads remain enabled.
- [ ] Never set `BLOB_READ_WRITE_TOKEN` in production; use approved Vercel OIDC identity.
- [ ] Set worker secrets independently from application/auth/rate-limit secrets.
- [ ] Confirm no secret exists in source, logs, screenshots, support tickets, or build output.

### Blob provisioning

- [ ] Obtain explicit approval for project, `fra1` region, private access, retention/legal policy, and cost owner.
- [ ] Provision through the approved Vercel project; do not use production data during rehearsal.
- [ ] Set expected/actual store IDs and private/region attestations.
- [ ] Confirm OIDC, private read/write/list/delete, direct upload grant expiry, maximum size, checksum, and no public URL.
- [ ] Run the existing synthetic non-production provider harness first, then a synthetic production-like smoke test.

### Roles and workers

- [ ] Assign named primary and backup owners for `DOCUMENT_REVIEWER`, `DOCUMENT_SECURITY_ADMIN`, and `DOCUMENT_RETENTION_OPERATOR`; assign downloader/incident roles only when needed.
- [ ] Validate recent Google reauthentication for each sensitive capability.
- [ ] Approve each worker cadence, timeout, maximum attempts, batch size, alert, and escalation.
- [ ] Rehearse retry, duplicate delivery, provider timeout, missing object, failed deletion, and orphan detection.
- [ ] Confirm no schedule exists until the launch owner signs this section.

### Smoke testing

- [ ] Sign in/out and confirm inactive users are denied.
- [ ] Verify public browsing and an authenticated quote.
- [ ] Create one synthetic BookingApplication; refresh/resume; verify no early Booking exists.
- [ ] Upload only synthetic PDF/JPEG/PNG; verify owner isolation, technical validation, manual review, replacement, and secure streaming.
- [ ] Finalize once and concurrently; verify one Booking and exact immutable snapshots/acceptances/bindings.
- [ ] Activate a synthetic release concurrently; verify one winner and audit evidence.
- [ ] Exercise rate-limit `429`/`Retry-After` from multiple application instances.
- [ ] Verify health/dashboard and alert delivery without exposing IDs or PII.
- [ ] Send approved synthetic email and verify failure alerting.

### Disaster recovery and operations

- [ ] Document RPO/RTO, database backup frequency, restore owner, and quarterly restore rehearsal.
- [ ] Export/retain database audit evidence according to legal policy without copying identity documents.
- [ ] Document Blob/provider incident containment, legal hold, orphan reconciliation, deletion pause, and recovery.
- [ ] Document Google OAuth, OIDC, email, Cloudinary, and worker-secret rotation.
- [ ] Maintain emergency feature-disable and worker-disable procedures.
- [ ] Name 24/7 launch contacts and escalation for security, privacy, operations, and business decisions.

## Rollback checklist

- [ ] Disable document entry points and both worker enable flags; do not delete evidence.
- [ ] Roll application traffic back to the previously verified artifact.
- [ ] Do not roll the database schema backward. Phase 9 tables are additive and backward-compatible.
- [ ] Preserve `RateLimitBucket`, `WorkerExecution`, AuditEvent, BookingApplication, Booking, snapshot, legal, document, review, and deletion evidence.
- [ ] If Blob is implicated, stop new uploads/deletions, preserve legal holds, and reconcile from database evidence before any provider action.
- [ ] If configuration activation is implicated, activate only through the existing versioned workflow; never mutate the active release in place.
- [ ] Rotate potentially exposed credentials and invalidate sessions when the incident requires it.
- [ ] Record incident timeline, release ID, artifact, migration state, owner decisions, and recovery verification.

## Open production decisions

1. **Blocking:** upgrade and test Nodemailer 9, or approve Resend-only and remove SMTP/Nodemailer.
2. **Blocking:** approve production private Blob project/region/OIDC/cost and retention/deletion policy.
3. **Blocking:** name restricted-role owners and worker/alert/deletion owners.
4. Select the external alert destination and on-call escalation; no paid service was added without approval.
5. Decide whether to pin Auth.js beta or schedule a stable-line migration.
6. Schedule dedicated Prisma 7 and inherited repository-lint remediation after launch hardening.

## Remaining risks

### Critical blockers

- Nodemailer advisories and Auth.js peer mismatch remain until the approved major/provider decision.
- Private production Blob/OIDC has not been provisioned or verified, by rule.
- Production worker schedules, restricted-role assignments, deletion runbook rehearsal, and external alert ownership are not active, by rule.

### Medium

- Auth.js v5 is beta and requires focused OAuth/session regression coverage before long-term enterprise support.
- Repository ESLint has 30 errors and 27 warnings inherited from earlier phases; scoped Phase 9 files are clean and build/typecheck pass.
- Email delivery occurs after the Booking transaction. A provider failure does not roll back a valid Booking and currently relies on monitoring/operator retry rather than an outbox.
- Prisma 5.22 is behind the current major; no unsafe automatic migration was attempted.

### Low

- Transitive version duplicates add install weight but do not create known post-audit vulnerabilities outside Nodemailer.
- Worker delivery can overlap; current operations are bounded/idempotent, and health reveals failures, but a leased single-flight claim may be useful at higher scale.
- Public health proves liveness, not business readiness; the protected dashboard is the authoritative readiness view.

## Files modified

- Operational schema/migration: `prisma/schema.prisma`, `prisma/migrations/20260714130000_add_phase9_operations/migration.sql`.
- Rate limiting/monitoring/health: `lib/rate-limit.ts`, `lib/logger.ts`, `lib/production/health.ts`, `app/api/health/route.ts`, `app/[locale]/admin/health/page.tsx`.
- Workers/security: Phase 8F-B worker route, booking-maintenance cron, Cloudinary signing route, private-document rate-limit callers, global security headers.
- Lifecycle/cleanup: `app/actions/bookings.ts`, disabled payment route, removed `lib/stripe.ts`.
- Email/configuration: `lib/email.tsx`, `lib/config.ts`, tracked `.env.local.example`.
- Dependencies: `package.json`, `pnpm-lock.yaml`.
- Tests/evidence: Phase 9 hardening tests, updated Phase 8F-B production-gate assertion, refreshed Graphify output, this report.

The pre-existing `.graphifyignore`, Graphify output directory, and `components/business-configuration/configuration-issue-list.tsx` working-tree change were not discarded.

## Verification evidence

Completed against disposable PostgreSQL 16 and synthetic inputs only:

- Prisma schema validation: passed.
- Prisma client generation: passed.
- Forward migration replay: all **32** migrations passed on a clean disposable database.
- TypeScript: passed.
- Tests: all **40 files / 273 tests passed**.
- Production build: passed on Next.js 16.2.10; workspace-root warning was corrected with top-level Turbopack root configuration.
- Scoped ESLint: passed with zero errors and zero warnings.
- Repository ESLint: inherited baseline remains **30 errors / 27 warnings**.
- Dependency audit after resolutions: **0 critical, 2 high, 5 moderate, 1 low**, all remaining advisories attributable to Nodemailer; the major decision remains blocking.
- Graphify: refreshed; 3,475 nodes, 7,739 edges, no import cycles, no duplicate endpoint collapse.
- `git diff --check`: passed.

## Recommended final phases

1. **Phase 10A — blocking dependency and owner decisions:** Nodemailer/provider choice, Auth.js support posture, alert destination, roles, retention/deletion owners.
2. **Phase 10B — production-like launch rehearsal:** isolated restored database, synthetic private Blob/OIDC, worker/alert rehearsal, rollback and disaster-recovery drill, security/privacy sign-off.
3. **Phase 10C — controlled deployment:** migrations, dark deploy, smoke tests, explicit feature/worker activation, monitored handover.
4. **Post-launch hardening:** inherited lint cleanup, Prisma major migration, optional worker lease/outbox only if operational evidence justifies them.
5. **Payment remains a separate future program** and must not begin without explicit approval.

Phase 9 stops here. No production provisioning or payment work follows from this document.
