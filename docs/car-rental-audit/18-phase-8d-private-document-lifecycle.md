# Phase 8D — Provider-neutral private-document lifecycle

## Outcome and scope

Phase 8D implements production-shaped private-document application boundaries with disposable local storage and a deterministic fake scanner. It does not implement or contact AWS, S3, KMS, GuardDuty, an external scanner, production uploads, OCR, identity verification, payments, or confirmation-template administration.

The local adapter and fake scanner are deliberately incapable of reporting production readiness. Real downloads remain blocked by the unsupported recent-reauthentication verifier until a later approved authentication phase supplies that evidence.

## Forward replacement migration

`20260713120000_allow_pending_document_replacements` is a new forward-only migration. No applied Phase 8C migration was edited. It replaces `enforce_phase8_customer_document()` with `CREATE OR REPLACE FUNCTION`, adds a duplicate-detecting manual-review preflight, creates `CustomerDocument_one_pending_replacement_key`, and installs a deferred commit-time replacement trigger.

The partial-index predicate uses `UPLOADED` and `VERIFYING`, with non-current, non-deleted, evidence-schema-v2 replacement rows. This does not deviate from the approved proposed predicate. Although the enum also contains `PENDING` and `UPLOADING`, the Phase 8C final-evidence state machine does not permit those as active replacement `CustomerDocument` states: those states belong to pre-final upload intent processing. `READY`, `REJECTED`, and `FAILED` are terminal for this predicate; deleted rows are excluded.

Committed replacement rules are:

- pending replacement: non-current with a current predecessor;
- promoted replacement: `READY`, current, clean, with a non-current predecessor;
- predecessor demotion and replacement promotion must commit in one transaction;
- a stale predecessor, concurrent candidate, duplicate pending candidate, self-reference, cycle, mismatched slot/owner/provenance, or non-increasing attempt is rejected;
- rejected or terminal failed replacements do not occupy the pending index and do not invalidate the prior current document.

The preflight raises a clear exception listing predecessor identifiers. It never deletes candidates or chooses a winner.

## Module architecture

- `domain/`: provider-neutral values, safe audit input, stable error codes, file limits.
- `storage/`: `PrivateDocumentStorage` and the disposable local adapter.
- `scanning/`: `MalwareScanner` and normalized deterministic fake results.
- `application/`: upload orchestration, file validation, readiness, access, holds, deletion, cleanup, and health.
- `authorization/`: exact capability plus policy checks and recent-reauthentication contracts.
- `retention/`: pure absolute-deadline calculations using Phase 8C enum values.
- `infrastructure/`: Prisma implementation of the lifecycle repository; Prisma types do not enter domain contracts.
- `testing/`: deterministic in-memory repository for service tests.

## Storage and scanning contracts

`PrivateDocumentStorage` supports upload targets, staged completion, deterministic inspection, bounded verification reads, quarantine/approval movement, opaque short-lived grants, verified deletion, existence checks, abort, abandoned cleanup, and provider health. Responses contain provider-neutral opaque references, never credentials, permanent URLs, or filesystem paths.

`LocalPrivateDocumentStorage` uses server-generated 48-hex object keys, `quarantine` and `approved` namespaces, private directory/file modes where supported, guarded path resolution, and an in-memory one-time grant mechanism. It rejects `public/` roots and throws in `NODE_ENV=production`.

> Local private storage is for disposable development and automated tests only.

`MalwareScanner` returns only `CLEAN`, `INFECTED`, `ERROR`, `TIMEOUT`, `UNSUPPORTED`, or `PASSWORD_PROTECTED` plus safe result codes and sanitized metadata. `DeterministicFakeMalwareScanner` is driven by explicit synthetic test directives, is idempotent per request key, performs no antivirus claim or network operation, and reports `productionReady: false`.

## Validation and checksum

Central validation accepts only PDF, JPEG, and PNG up to 10 MiB. It checks server-calculated SHA-256, size, empty input, safe basename, normalized extension, unsafe double extensions, declared MIME, magic bytes, basic format termination, extension/signature agreement, and selected PDF active-content markers. SVG, HTML, JavaScript, executables, archives, macro-enabled files, unknown binaries, malformed files, and MIME/signature mismatches fail closed.

Checksum equality is evidence and an idempotency input, not proof that content is safe. File bytes, base64 data, raw scanner responses, access grants, and local paths are never persisted in document metadata or audit events.

## Upload, quarantine, scan, and compensation

The lifecycle service resolves the active configuration release and exact document policy server-side, validates session ownership, rule/type/side/slot, creates an opaque provider target, inspects stored metadata, reads with a fixed limit, validates bytes, persists exact provenance and retention evidence, and appends safe audits.

Documents remain quarantined and inaccessible through verification and scan. Clean initial evidence moves to approved storage and becomes current/`READY`. Infected, unsupported, or password-protected evidence is rejected and remains inaccessible. Timeout/error evidence remains `VERIFYING` for a bounded retry; exhaustion becomes terminal `FAILED`. Duplicate terminal completion and duplicate scan-result processing are idempotent.

If intent persistence fails after target allocation, the target is aborted. Missing/mismatched objects fail verification and remain inaccessible. Storage/scanner errors never create clean evidence. The orchestration does not claim a cross-system ACID transaction; provider operations use idempotency and cleanup/compensation boundaries, while atomic replacement switching is a database transaction.

## Replacement and readiness

Replacement creation requires a still-current predecessor with the same customer, session, document type, side, and slot. It receives a strictly higher attempt. The old clean object stays current while the new object is pending, infected, rejected, or failed. Only a clean approved replacement is promoted, and repository promotion updates both database rows atomically. Full attempt history is retained.

The readiness resolver evaluates exact release/policy provenance, customer/session ownership, identity choice, required slots and sides, current status, clean scan, retention, and deletion. It returns stable results for ready, missing, pending scan, rejected, expired, invalid provenance, and policy conflict. Checkout integration remains outside Phase 8D.

## Authorization and read access

Content operations require the exact Phase 8C restricted capability and the exact policy permission. View, download, delete, and legal-hold management are distinct. Legacy `ADMIN` and `ADMIN_COMPAT` do not inherit restricted document capabilities; direct service invocation fails without authorization.

Read access is issued only for current, retained, approved, `READY`/`CLEAN` evidence. Default grant lifetime is five minutes; download grants are one-time. Downloads also require the recent-reauthentication contract. The production-shaped unsupported verifier denies them; tests use an explicit fake verifier. Grant values are not persisted or audited.

## Retention, hold, deletion, and cleanup

Retention is calculated once into absolute deadlines using Phase 8C values: `UPLOAD_SESSION_EXPIRY`, `BOOKING_CANCELLED`, `RENTAL_COMPLETED`, `REJECTED_UPLOAD`, and `INCIDENT_PRESERVATION`. Test assumptions remain provisional: 90 days after completion, 365-day hard maximum without a hold, and seven-day deletion grace.

Legal holds require their dedicated capability, a reason, actor/time evidence, and optimistic revision control. One active hold is idempotent, release remains historical, and a hold blocks deletion without widening access.

Deletion requires its dedicated capability, elapsed absolute retention, no active hold, and an idempotency key. The service records bounded attempts, asks the provider to delete, verifies absence, records a confirmation reference, and tombstones the document metadata rather than hard-deleting it. Failures record safe retryable evidence and never mark the document deleted.

Worker-ready bounded functions expire sessions, clean abandoned targets, discover due documents, retry eligible scans, and retry failed deletion requests. No scheduler, queue, or cron configuration was added.

## Health and audit

Health distinguishes adapter availability from production readiness. With local/fake adapters it reports lifecycle readiness for later provider integration together with:

- `DOCUMENT_LOCAL_ADAPTER_ONLY`
- `DOCUMENT_PRODUCTION_STORAGE_NOT_CONFIGURED`
- `DOCUMENT_FAKE_SCANNER_ONLY`
- `DOCUMENT_PRODUCTION_SCANNER_NOT_CONFIGURED`
- `DOCUMENT_LIFECYCLE_READY_FOR_PROVIDER_INTEGRATION`

Safe audit events cover session/intent creation, upload completion, verification pass/fail, scan request/completion/failure, clean/rejected results, replacement request/completion, access request/grant/denial, retention calculation, hold apply/release, deletion request/success/failure, and cleanup. Metadata is bounded and excludes contents, tokens, paths, raw provider responses, secrets, and customer identity values.

## Verification

Disposable PostgreSQL 16 and synthetic non-sensitive rows verified:

- all 28 migrations replay from empty and a second deploy reports no pending migrations;
- representative Phase 8C rows replay before the forward correction;
- pending creation, prior-current preservation, clean atomic promotion, rollback on failed promotion, rejected/failed replacement preservation, new attempt after terminal failure, unique-race winner, stale rejection, self-reference, cycles, attempt order, slot/owner equivalence, deletion exclusion, and historical-row compatibility;
- duplicate pending preflight fails for manual review and leaves both rows unchanged;
- Prisma database-to-schema diff is empty.

Disposable filesystem and service tests cover file types, unsafe payloads, opaque storage, one-time access, all fake scan outcomes, bounded timeout retry, clean/rejected replacement, readiness, restricted access, holds, retention, verified deletion, health blocking, and migration text invariants.

Validation commands: Prisma format/validate/generate, TypeScript, full Vitest, scoped ESLint, Next build, migration replay/diff, and `git diff --check`.

## Files and Phase 8E readiness

Phase 8D adds the `lib/private-documents/` module tree, the forward migration and SQL verification script, focused unit/integration tests, and this report. `Car.price`, historical document evidence, `.graphifyignore`, and `graphify-out/` remain untouched.

Phase 8E still needs explicit approval and decisions for the real private object provider, encryption/key ownership, network/region boundary, provider upload/access mechanism, production malware scanner and callback authenticity, recent-reauthentication policy, secrets/configuration, operational alerts, recovery/cleanup workers, and infrastructure provisioning. No Phase 8E work has begun.
