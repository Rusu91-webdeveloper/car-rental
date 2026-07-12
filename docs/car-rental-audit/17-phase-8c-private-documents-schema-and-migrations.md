# Phase 8C — Private-document schema and migrations

Completion date: 2026-07-13. Scope: approved private-document persistence, additive PostgreSQL migrations, lifecycle integrity, restricted capability persistence/evaluation, and disposable verification only.

No storage adapter, AWS/S3/KMS/GuardDuty integration, malware-scanner integration, upload route, signed URL, checkout/admin document UI, retention worker, provider deletion worker, external storage request, or file upload was implemented.

## Outcome

Phase 8C applies the approved provider-neutral persistence foundation:

- typed pre-booking upload sessions and per-slot upload intents;
- exact release, policy, requirement, session, and intent provenance;
- versioned final-document verification, quarantine, scan, replacement, retention, and deletion summaries;
- append-only terminal malware scan attempts;
- explicit legal-hold application/release history;
- typed deletion requests and append-only provider attempts;
- partial uniqueness and lifecycle triggers for concurrency/integrity;
- narrow document roles and legal-hold capability without any user bootstrap;
- runtime capability filtering that prevents `ADMIN` and `ADMIN_COMPAT` from automatically granting sensitive document capabilities.

The Documents workflow remains unavailable. These tables contain synthetic metadata only during verification and no file bytes or public/signed URLs.

## Final schema

New enums:

- `IdentityDocumentChoice`
- `DocumentUploadSessionStatus`
- `DocumentUploadIntentStatus`
- `DocumentQuarantineStatus`
- `DocumentRetentionBasis`
- `DocumentDeletionRequestStatus`
- `DocumentDeletionAttemptOutcome`

`MalwareScanStatus` adds `ERROR`, `TIMEOUT`, `UNSUPPORTED`, and `PASSWORD_PROTECTED`; all historical values remain.

New models:

- `DocumentRequirementTranslation`
- `DocumentUploadSession`
- `DocumentUploadIntent`
- `DocumentMalwareScanAttempt`
- `DocumentLegalHold`
- `DocumentDeletionRequest`
- `DocumentDeletionAttempt`

Modified models:

- `User`, `Car`, `Booking`, and `BusinessConfigurationRelease` receive required inverse relations.
- `DocumentPolicyConfigVersion` receives identity choice, confirmation reminder, and upload-session relations.
- `DocumentRequirementRule` receives translation, intent, and final-document relations.
- `DocumentPolicyRolePermission` receives `mayManageLegalHold`.
- `CustomerDocument` retains every historical field and adds nullable evidence-versioned provenance, logical slot/attempt, replacement, provider container/version, declared MIME, validation, quarantine, scan summary, retention basis/snapshots, and deletion eligibility.

No `publicUrl`, `signedUrl`, binary/base64, OCR text, image text, raw report, or credential column exists.

## Phase 8B deviations

Two small additive adjustments were made because the Phase 8C authorization explicitly required these facts by name:

1. `DocumentDeletionRequest.requestedAt` is persisted separately from row `createdAt`.
2. `DocumentDeletionAttempt.retryable` is explicit and checked against its normalized outcome instead of relying only on `RETRYABLE_FAILURE` versus `PERMANENT_FAILURE`.

Prisma validation confirmed the approved `documentRequirementTypeId` compatibility scalar is necessary and valid: it gives `CustomerDocument` an exact compound requirement FK without removing or overlapping the existing direct `documentTypeId` relation. A version-2 check requires the two type IDs to match.

Lifecycle verification also refined the approved SQL without changing model boundaries:

- upload-session and intent transitions require the next revision;
- final-document upload, quarantine, and deletion transitions cannot be skipped;
- final deletion changes quarantine disposition to `DELETED` while retaining prior verification evidence;
- READY evidence remains immutable except explicitly controlled replacement, retention, hold-summary, and deletion fields.

## Six additive migrations

### `20260713110000_add_phase8_upload_foundation`

Adds new enums, neutral policy defaults, hold permission flag, localized requirement instructions, upload sessions/intents, provider/idempotency/slot uniqueness, indexes, and restrictive FKs.

Existing policies default to identity choice `DISABLED`, reminder true, and hold permission false. Phase 8 aggregate policy rules apply to schema-version-2 policies; existing schema-version-1 releases are not reinterpreted.

### `20260713110100_add_phase8_document_provenance`

Adds nullable `CustomerDocument` evidence fields plus safe defaults:

- `evidenceSchemaVersion = 1`
- `isCurrent = true`
- `scanAttemptCount = 0`

Nullable historical FKs are added `NOT VALID` and then validated. No UPDATE/backfill runs against existing documents.

### `20260713110200_add_phase8_scan_evidence`

Adds precise malware outcomes and `DocumentMalwareScanAttempt` with per-document monotonic attempt uniqueness, provider reference/event deduplication, operational indexes, and restrictive document FK.

### `20260713110300_add_phase8_retention_hold_deletion`

Adds legal-hold history, deletion requests, deletion attempts, actor/timestamp/provider evidence, idempotency/provider-reference uniqueness, and restrictive FKs. Existing hold/deletion summaries are not converted into evidence.

### `20260713110400_add_phase8_restricted_capabilities`

Idempotently seeds:

- `documents.legal-hold.manage`
- `DOCUMENT_REVIEWER`
- `DOCUMENT_DOWNLOADER`
- `DOCUMENT_RETENTION_OPERATOR`
- `DOCUMENT_LEGAL_HOLD_OFFICER`

Role mappings are narrow. No `UserAccessRole` is inserted and `ADMIN_COMPAT` receives no new capability. Re-executing the seed kept one capability, four roles, and zero restricted assignments.

### `20260713110500_add_phase8_lifecycle_integrity`

Adds checks, partial indexes, configuration-child immutability, state-machine triggers, append-only controls, cross-row provenance consistency, replacement-chain rules, scan-summary consistency, hold-summary consistency, and verified deletion requirements.

## Constraints and indexes

Prisma uniqueness covers:

- one nullable Booking per upload session;
- intent idempotency;
- provider/container/key and provider-upload reference;
- session/type/side/slot/attempt;
- document-to-intent one-to-one;
- scan/deletion attempt numbers;
- provider scan/deletion references and callback event IDs.

Custom partial indexes enforce:

- one current nondeleted Phase 8 document per session/type/side/slot;
- one active legal hold per document;
- one noncompleted deletion request per document;
- due retention, pending scan, hold review, and deletion-work lookups.

Checks enforce positive revisions/slots/attempts, 10 MiB maximum, PDF/JPEG/PNG MIME/extension contract, lowercase SHA-256, safe bounded codes, 4 KiB sanitized scan metadata, 90/365-day-compatible snapshots, seven-day deletion completion ceiling, terminal timestamp shapes, hold release completeness, deletion retryability/outcome agreement, and version-2 evidence completeness.

The retention values remain provisional and require final legal/client approval before production activation.

## Lifecycle enforcement

Database-enforced transitions:

- Session: `OPEN -> CONSUMED | EXPIRED | ABORTED`; bindings are immutable, terminal sessions cannot be reused, and consumed sessions must match Booking/pricing evidence.
- Intent: ordered creation/upload/verification/quarantine/scan/clean transitions with approved failure/expiry paths; retries use new attempts/keys.
- Document: `UPLOADED -> VERIFYING -> READY`, with rejection/failure exits; completed evidence is immutable.
- Quarantine: `QUARANTINED -> RELEASED | REJECTED | DELETED`, then released/rejected to deleted.
- Scan: terminal attempts are append-only and deduplicated; current summary must match the latest attempt or a later pending retry.
- Hold: one active record, complete apply/release evidence, released history immutable, and summary consistency deferred to transaction end.
- Deletion: `RETAINED -> SCHEDULED -> DELETED | FAILED`, retry from FAILED; request transitions require next revision and verified successful attempt before completion.
- Replacement: no self-reference, exact slot/customer/type/session equivalence, greater attempt number, one current row, and acyclic/monotonic history.

Application services remain responsible in Phase 8D for authentication/authorization context, provider/scanner calls, safe error mapping, bounded retries, signed-access issuance, and orchestration. Database permissions—revoking direct update/delete and separating migration/repair roles—remain a deployment gate.

## Restricted authorization

`RESTRICTED_DOCUMENT_CAPABILITIES` contains:

- `documents.view`
- `documents.download`
- `documents.delete`
- `documents.legal-hold.manage`

The pure capability evaluator no longer grants these from `role = ADMIN`. The persisted capability repository and direct database capability check ignore these keys when they originate from `ADMIN_COMPAT`. Explicit active noncompatibility role assignments still work. Unrelated ADMIN compatibility remains unchanged.

Tests cover legacy ADMIN denial, `ADMIN_COMPAT` filtering, explicit reviewer allowance, and unrelated configuration capability compatibility.

## Historical compatibility and backfill

The representative row was inserted after Phase 7 and before all Phase 8 migrations. After applying the six raw Phase 8 migrations it retained:

- `evidenceSchemaVersion = 1`;
- null release/policy/rule/session/intent provenance;
- null quarantine, retention-basis, verification, scan-attempt, hold, deletion-request, and replacement evidence;
- unchanged legacy storage/checksum/status values.

No migration UPDATE targets `CustomerDocument`. No release, policy, scan, hold, deletion, provider, or replacement fact is inferred from current settings, filenames, object keys, or audit JSON.

Phase 8D services must write evidence version 2 and every required provenance/evidence fact. The database rejects incomplete or inconsistent version-2 documents.

## Disposable PostgreSQL verification

Environment:

- container: `car-rental-phase8c-postgres`
- image: PostgreSQL 16 Alpine
- host binding: `127.0.0.1:55433`
- databases: `phase8c_shadow`, `phase8c_replay`, `phase8c_legacy`, `phase8c_verify`
- data: synthetic `.invalid` users and metadata only
- authentication: local disposable trust inside the container

No repository-configured, production, staging, shared, external, or personal-data database was contacted.

Results:

| Verification | Result |
|---|---|
| Full 27-migration replay from empty | Pass |
| Safe second `migrate deploy` | Pass; no pending migrations |
| Prisma database-to-schema diff | Pass; no difference |
| True Phase-7 legacy-row then six Phase-8 SQL replay | Pass |
| Historical nullable evidence/no fabrication | Pass |
| Intent idempotency/provider uniqueness | Pass |
| Expired/aborted/terminal session guards | Pass |
| Session rebinding/invalid consumption | Rejected |
| Intent ordered transitions/duplicate completion | Pass/rejected as expected |
| Version-2 provenance and READY requirements | Pass/rejected as expected |
| One current slot and replacement monotonic/cycle guard | Pass/rejected as expected |
| Scan append-only, numbering, callback deduplication, summary | Pass |
| One active hold, release history, deletion blocking | Pass |
| Deletion idempotency and one open request | Pass |
| Deletion append-only attempts and verified outcome | Pass |
| Staged deletion and retained tombstone | Pass |
| Restrictive evidence FK deletion | Pass |
| Capability seed executed twice | Pass; 1 capability, 4 roles, 0 assignments |
| Expected failed statements/transaction recovery | Pass; later valid writes succeeded |

Synthetic verification files contain no real identity or document data and no bytes.

## Commands and application validation

Completed:

- `pnpm exec prisma format`
- `pnpm exec prisma validate`
- `pnpm exec prisma generate`
- complete and legacy disposable PostgreSQL replay
- safe second `pnpm exec prisma migrate deploy`
- `pnpm exec prisma migrate diff ... --exit-code`
- `scripts/phase8c-schema-verification.sql`
- capability seed idempotency replay
- `pnpm typecheck`
- `pnpm test:run` — 27 files, 176 tests
- scoped ESLint for all touched TypeScript/tests
- `pnpm build`
- `git diff --check`

Build passed with the existing warnings about stale `baseline-browser-mapping` data and Next.js workspace-root inference caused by `/Users/emanuelrusu/package-lock.json`. No dependency was changed to suppress them.

## Migration locks and forward recovery

- New tables/indexes do not rewrite historical data.
- Enum and nullable/default-column additions take brief catalog/table locks; production lock timing still requires a rehearsal against representative volume.
- Nullable historical FKs use staged validation.
- Partial indexes are ordinary migration indexes in this implementation; production deployment must decide whether table size/traffic warrants a separately reviewed concurrent-index strategy.
- Before shared application, fix an unapplied migration and replay from empty, as exercised during disposable development.
- After any shared application, never edit these migration files; ship a forward correction.
- If an index/constraint/trigger deployment fails, keep Documents disabled, inspect the exact failed object, correct forward, and rerun verification. Never delete evidence to make a constraint pass.
- Application rollback leaves additive schema/evidence intact and disables Phase 8 behavior. It must never restore legacy ADMIN document access.

## Phase 8D readiness and remaining blockers

Phase 8D may begin only with explicit approval. Schema/migration work is ready for provider-neutral domain services, policy administration, local disposable storage, fake scanner, and synthetic lifecycle tests.

Still required before the affected implementation or production activation:

- recent-reauthentication duration before download implementation;
- approved PDF structural validator/CDR before PDF acceptance;
- named KMS/security owner and reviewed S3/KMS/IAM/Block Public Access design;
- GuardDuty/EventBridge authentication, retry, replay and dead-letter design;
- final legal/client approval for 90-day default, 365-day maximum, and seven-day grace;
- named reviewer/downloader/retention/hold role assignees;
- incident, privacy/legal escalation, evidence-retention, DPA/TIA, and subprocessor decisions;
- content backup/versioning and deletion-propagation confirmation;
- production database-role restrictions, monitoring, backup/restore and lock rehearsal.

Stop here. Phase 8D storage, scanner, uploads, access, checkout/admin UI, and workers are not part of Phase 8C.
