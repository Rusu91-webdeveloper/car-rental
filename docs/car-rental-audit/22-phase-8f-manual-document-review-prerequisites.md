# Phase 8F-A — manual private-document review prerequisites

Date: 2026-07-13. Status: implementation complete; production remains disabled pending the blockers below.

No external scanner, production Blob store, production/shared database, real upload, identity document, or customer file was contacted. Verification used synthetic JPEG metadata/bytes, a process-scoped private filesystem, and disposable PostgreSQL only.

## Product decision and security boundary

The managed scanner path was cancelled for v1. OPSWAT MetaDefender Cloud was evaluated but is only an optional future upgrade. Cloudmersive, AttachmentScanner, VirusTotal, ClamAV, and other scanners are not selected or integrated.

Manual review does not replace technical validation. Before review, every object must pass the existing PDF/JPEG/PNG allowlist, 10 MiB limit, declared and detected MIME checks, normalized extension check, magic-byte signature validation, basic JPEG/PNG/PDF structural validation, SHA-256 verification, opaque-path private storage, no-overwrite behavior, and server-side provider metadata verification. Invalid or mismatched files never enter the review queue.

Manual review checks business suitability only: legibility, cropping, expected type/side, apparent expiry, booking-detail consistency, missing information, or obvious alteration. It is neither automated identity verification nor reliable sophisticated-forgery detection.

## Additive migration

`20260713130000_add_phase8f_manual_review` is one new forward migration. No applied Phase 8C/8D migration was edited.

It adds `TECHNICALLY_VALID` to the upload-document and upload-intent enums while preserving scanner-backed `READY` and `CLEAN`. It adds the separate `DocumentManualReviewStatus`, `DocumentReviewDecision`, and `DocumentReviewReason` enums, review summary columns on `CustomerDocument`, and append-only `CustomerDocumentReviewDecision` evidence with direct release, policy, requirement, session, customer, slot, side, and attempt provenance.

Historical rows receive only `manualReviewStatus=NOT_READY` and `reviewRevision=0`. Reviewer, timestamp, decision, reason, note, and history remain absent. The representative legacy replay proved no evidence was fabricated.

Database enforcement covers:

- technical/manual state separation;
- zero scanner evidence in manual mode;
- `NOT_READY → PENDING_REVIEW → one terminal decision` transitions;
- structured reason requirements and bounded plain-text notes;
- server timestamps, monotonic decision versions, and append-only history;
- deferred summary/latest-decision consistency;
- locked optimistic decisions and one concurrent winner;
- pending replacement uniqueness;
- atomic multi-generation replacement promotion;
- stale predecessor rejection and prior-current preservation on failure;
- immutable technical evidence, self-reference, cycle, slot/type/side/owner, attempt, deletion, and provenance checks;
- unchanged scanner-backed READY/CLEAN compatibility.

Empty replay, historical overlay, repeat deploy, scanner compatibility, manual lifecycle SQL, two-connection concurrency, capability idempotency, and zero Prisma schema diff were tested on local disposable PostgreSQL 16.

## Manual lifecycle

1. The server creates an exact release/policy-bound upload session and intent.
2. A private Blob is written at the exact opaque pathname with overwrite disabled.
3. The server privately retrieves and technically validates the object.
4. Manual mode writes `uploadStatus=TECHNICALLY_VALID`, intent `TECHNICALLY_VALID`, `scanStatus=NOT_AVAILABLE`, zero scan attempts, no scanner reference/result/timestamps, quarantine `QUARANTINED`, and review `PENDING_REVIEW`.
5. An authorized, recently reauthenticated reviewer may preview the quarantined object through the protected server route.
6. The reviewer records APPROVED, REJECTED, or REPLACEMENT_REQUIRED.
7. Approval changes only business review/quarantine/current summary and appends authoritative evidence. It never creates CLEAN or READY scanner evidence.
8. Rejection and replacement-required decisions keep the document insufficient and preserve history.

An approved replacement atomically makes its still-current predecessor non-current and itself current. Pending or rejected replacements never displace the prior approved document. Each new attempt receives a new immutable Blob object and document row.

## Capabilities and roles

The restricted capability set now includes `documents.review`, `documents.request-replacement`, `documents.security.manage`, and `documents.incident.view` in addition to the Phase 8C view/download/delete/legal-hold capabilities. `ADMIN` and `ADMIN_COMPAT` remain filtered from every restricted document capability.

`pnpm documents:roles:bootstrap` idempotently prepares:

- `DOCUMENT_REVIEWER`;
- `DOCUMENT_DOWNLOADER`;
- `DOCUMENT_SECURITY_ADMIN`;
- `DOCUMENT_RETENTION_OPERATOR`;
- `DOCUMENT_INCIDENT_REVIEWER`.

The bootstrap assigns no users. Assignment/revocation uses the protected role service, requires recent Google authentication, targets an active different user, and writes an authorization audit event. Self-escalation is rejected. The first security administrator may be assigned by a recently authenticated actor with existing `roles.manage`, but never to that actor; later changes require `documents.security.manage`. This is the documented emergency bootstrap path.

Exact active document-policy permissions remain an additional access requirement. A role assignment alone does not bypass a policy.

## Recent Google authentication

Auth.js records `googleAuthenticatedAt` from server time only while processing a verified Google OAuth callback. The signed JWT carries that evidence into the server session. Browser timestamps are not accepted.

The maximum age is ten minutes. Missing, expired, or unavailable provider evidence produces `RECENT_AUTH_EVIDENCE_MISSING`, `RECENT_AUTH_EXPIRED`, or `RECENT_AUTH_PROVIDER_UNAVAILABLE`. The server reauthentication action invokes Google with `prompt=login` and `max_age=0`; its return path is restricted to a local absolute path.

Recent authentication is enforced for review preview, approved view/download, approval, rejection, replacement request, deletion request, legal-hold changes, and restricted-role assignment. Workers processing an already authorized deletion do not impersonate an interactive user.

## Protected access

The production-shaped routes are:

- `/api/private-documents/[documentId]/view`;
- `/api/private-documents/[documentId]/download`;
- `/api/private-documents/[documentId]/review`;
- `/api/private-documents/review-queue`;
- `/api/private-documents/restricted-roles`.

View/download routes authenticate in the handler, reload active persisted roles/capabilities, resolve exact policy permissions server-side, verify document/customer/session/booking scope, enforce technical/manual/deletion/current state, enforce recent Google authentication, resolve the private object internally, and stream it from the server. They return `private, no-store`, `nosniff`, safe disposition, no-referrer, and same-origin framing headers. They never return Blob credentials, pathname, provider URL, upload grant, or full storage key.

Pending review preview additionally requires both `documents.view` and `documents.review`. Normal approved downloads require `documents.download`. Deleted, scheduled-for-deletion, expired, technically invalid, or otherwise terminal-inaccessible records are denied and audited.

## Decisions, readiness, and customer status

Approval verifies exact provenance, technical status, deletion state, current predecessor, optimistic revision, and reviewer authorization. Rejection/replacement requires one structured reason. `OTHER` requires a trimmed, link-free, HTML-free note of at most 500 characters. Audit metadata contains the structured reason only; the note remains bounded primary review evidence.

Manual-mode booking readiness accepts only a technically valid, manually APPROVED, current, retained, unexpired document with exact customer/session/release/policy/type/slot/side provenance. Pending, rejected, replacement-required, wrong-provenance, wrong-slot, non-current, or deleted documents do not satisfy required slots. The existing preferred rule remains: required documents must be approved before final Booking creation.

Provider-neutral customer statuses are Upload received, Checking file, Waiting for review, Approved, Rejected, and Please upload a replacement. Customer messages map from safe structured reasons and never reveal reviewer identity, internal enum names, notes, or document details.

## Queue, workers, monitoring, and health

The restricted queue backend supports pending/rejected/replacement statuses, document type, booking, upload window, cursor pagination, pending count, and age. Queue items contain safe metadata only—never content or storage identity.

Existing bounded/idempotent cleanup, retention, deletion, retry, and hold boundaries remain. `TECHNICALLY_VALID` is terminal for abandoned-upload cleanup, so a valid review object is not mistaken for an abandoned upload. Orphan reconciliation lists only the approved environment prefix, checks both intents and documents, records an opaque hash for manual investigation, and never automatically deletes or chooses evidence. Review monitoring records bounded pending/stale counts and backlog alerts. Scanner polling/retry remains available only for the disabled future scanner mode and is not a manual-mode production prerequisite.

Sanitized monitoring covers access denials, legacy-admin attempts, repeated rejection/replacement decisions, provider failures, metadata/checksum mismatches, cleanup failures, retention activity, deletion failures, restricted-role changes, stale reviews, backlog, and orphan objects. It never records content, pathname, URL, token, unrestricted notes, or customer PII.

Manual production health requires private Vercel Blob readiness/attestation, technical validation, recent authentication, assigned reviewer, downloader when downloads are enabled, queue, audit persistence, cleanup/retention/deletion workers, confirmed policy/retention decisions, disabled local adapter, and disabled scanner path. Stable blockers include `DOCUMENT_MANUAL_REVIEW_NOT_CONFIGURED`, `DOCUMENT_REVIEWER_ROLE_UNASSIGNED`, `DOCUMENT_REVIEW_QUEUE_UNAVAILABLE`, `DOCUMENT_REAUTH_NOT_CONFIGURED`, `DOCUMENT_TECHNICAL_VALIDATION_UNAVAILABLE`, `DOCUMENT_RETENTION_WORKER_UNAVAILABLE`, and `DOCUMENT_DELETION_WORKER_UNAVAILABLE`. A fake scanner cannot make manual mode ready, and absence of a scanner does not add the obsolete scanner blocker.

## Tests and remaining Phase 8F-B blockers

The test suite covers technical admission, manual pending state, missing/stale reauthentication, legacy-admin denial, capability separation, approval, structured rejection/replacement, optimistic concurrency, history, readiness, pending preview, approved download capability, replacement preservation/promotion, health, storage safeguards, retention, deletion, and migration constraints. Only synthetic files and disposable/local resources were used.

Phase 8F-B still requires explicit approval before:

- full customer upload/status UI;
- full administrator queue/review screens;
- production private Blob provisioning or environment attestation;
- real customer uploads;
- real reviewer/downloader assignments and policy grants;
- production worker scheduling and alert destinations;
- final retention/legal-policy owner confirmation;
- production runbook rehearsal and framework/security-release review.

Automated malware scanning remains deferred. The `MalwareScanner` interface, scan-attempt persistence, fake test adapter, and scanner-backed READY/CLEAN tests remain intact for a future separately approved adapter.
