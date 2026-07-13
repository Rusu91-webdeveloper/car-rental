# Phase 8F-B — customer and administrator private-document workflow

Date: 2026-07-13. Status: **application/UI implementation complete in non-production; stopped before production provisioning and schedule enablement**.

Phase 8F-A remains unchanged. Phase 8F-B is additive and preserves all historical Booking, snapshot, legal, document, review, upload-session, and audit evidence. No production Blob store was provisioned or contacted, no real identity document or customer data was used, no payment processing was added, and no production worker schedule was enabled.

## Location-semantics decision

The mandatory repository review found one checkout control, one `location` URL parameter, one `Booking.location` write, and one value rendered in booking success, email, admin, and booking history. Pricing and availability do not branch on location. There is no return-location control or second location value. The current product therefore supports **same pickup and return location only**.

Phase 8F-B makes that contract explicit:

- checkout labels the input “Pick-up and return location”;
- `BookingApplication.pickupLocation` and `returnLocation` retain identical evidence values;
- application validation rejects unequal or blank values;
- migration `20260713141000_enforce_phase8fb_shared_location_and_review` adds a validated database equality constraint;
- finalization calls the explicit `mapApplicationLocationToBooking` mapper;
- the shared value is written to `Booking.location`;
- tests prove equality and rejection of silent location loss.

A future different-location product requires a separately approved additive Booking snapshot/schema change. JSON, concatenation, and silent dropping are prohibited.

## Application services and persistence

The provider-neutral service boundary is in `lib/booking-applications`; Prisma is confined to `infrastructure/prisma-repository.ts`. Implemented service operations are:

- `createBookingApplication`;
- `updateBookingApplicationCustomerDriver`;
- `updateBookingApplicationInsurance`;
- `updateBookingApplicationPaymentSelection`;
- `createOrRefreshApplicationQuote`;
- `recordApplicationLegalAcceptance`;
- `submitApplicationForDocumentReview`;
- `loadBookingApplication`;
- `resumeBookingApplication`;
- `evaluateBookingApplicationReadiness`;
- `markApplicationCustomerActionRequired`;
- `expireBookingApplications`;
- `cancelBookingApplication`;
- `finalizeBookingApplication`.

Creation is owner-bound and idempotent, snapshots the exact active Business Configuration release, creates and binds one document upload session, and advances the database-controlled lifecycle. Every mutation uses an expected application revision. Cross-owner access, stale revisions, expired state, terminal state, invalid configuration, and location mismatch have stable error codes.

## Checkout persistence and resume

Checkout now calls `beginBookingApplication` instead of the legacy early-Booking action. The server validates and persists customer/driver data, insurance, payment-method choice, authoritative quote, quote confirmation, legal evidence, dates, and the shared location. Browser totals, configuration identifiers, content hashes, and readiness claims are ignored.

The browser-generated idempotency key only correlates a retry; the database and authenticated owner define identity. A successful checkout redirects to the opaque localized route:

- `/{locale}/applications/{applicationId}`.

The resume page reloads progress from PostgreSQL, rejects cross-user access, survives refresh/browser restart, renders expiry and safe terminal states, and links the final Booking after finalization. Refresh does not create another application.

No Booking is created while documents are awaiting upload or manual review.

## Customer upload and status flow

Routes:

- `POST /api/booking-applications/[applicationId]/upload-intents`;
- `PUT /api/booking-applications/[applicationId]/upload-intents/[intentId]/content` for the local disposable adapter;
- `POST /api/booking-applications/[applicationId]/upload-intents/[intentId]/complete`.

The UI renders the exact release-bound typed requirements, including ID-card/passport alternatives, driving licence, front/back or single-file slots, required/optional state, and replacement lineage. It accepts PDF/JPEG/PNG up to 10 MiB, hashes the selected bytes for upload binding, shows transfer progress, and supports re-upload/replacement.

For the approved private Vercel Blob adapter the intent returns a short-lived direct PUT target. For local disposable development it returns a staged target. A successful browser PUT remains provisional: only server-side object inspection, signature/MIME/size/checksum validation, evidence persistence, and `PENDING_REVIEW` creation count as completion. Expired sessions and technical failures return stable safe codes.

Customer states include not uploaded, checking, pending review, approved, rejected, replacement required, and re-upload. Only synthetic test bytes were used.

## Restricted administrator review

Routes and components:

- `/{locale}/admin/documents` — restricted queue, filters, cursor pagination, and 24-hour stale indicator;
- `/{locale}/admin/documents/[documentId]` — secure review page;
- `GET /api/private-documents/review-queue`;
- `POST /api/private-documents/[documentId]/review`.

The review page uses protected server streaming and exposes only safe technical metadata. Review decisions support approve, reject, and replacement-required; non-approval requires a structured reason, `OTHER` requires a safe note, and the repository enforces optimistic `reviewRevision`. The page renders append-only decision and replacement history. A stale reviewer receives a conflict rather than overwriting another decision.

Legacy `ADMIN` and `ADMIN_COMPAT` remain denied restricted document capabilities without an explicit `DOCUMENT_*` role.

## Secure access and recent authentication

Existing protected routes are fully used:

- `GET /api/private-documents/[documentId]/view`;
- `GET /api/private-documents/[documentId]/download`.

They enforce active authentication, persisted restricted capabilities, exact policy permission, exact document scope, ten-minute server-verified Google authentication, lifecycle state, safe server streaming, `private, no-store`, `nosniff`, safe content disposition, audit evidence, and no provider pathname disclosure. Pending-review preview is reviewer-only. Download additionally requires `documents.download` and approved lifecycle evidence.

`ReauthenticatePanel` starts Google OAuth with `prompt=login` and `max_age=0`, accepts only safe local return paths, and returns to the intended localized action. Review, preview, download, legal hold, deletion, and restricted-role management use the same server-verified evidence. There is no production bypass.

Additional sensitive routes/pages:

- `POST/DELETE /api/private-documents/[documentId]/legal-hold`;
- `POST /api/private-documents/[documentId]/deletion`;
- `/{locale}/admin/documents/security`;
- `POST /api/private-documents/restricted-roles`.

## Readiness

The application evaluator returns stable blocker codes plus plain-language customer messages. `READY_TO_FINALIZE` requires:

1. an active owner-bound, unexpired application;
2. valid customer/driver evidence;
3. valid exact insurance and payment selections;
4. one current unexpired owner-confirmed authoritative quote;
5. current-round required legal evidence;
6. exact release and policy provenance;
7. every required slot/side technically valid and manually approved;
8. correct ID-card/passport alternative semantics;
9. no unresolved customer action.

The forward-only follow-up migration adds a second database gate requiring manual `APPROVED` state. “Technically clean” alone cannot make an application ready.

## Quote, legal renewal, and finalization

Finalization executes in a serializable transaction. It locks `BookingApplication`, returns the existing Booking for an already-finalized application, validates owner/revision/readiness, locks `Car`, rechecks availability, recalculates the authoritative quote, and compares it with the confirmed quote. A changed price preserves/demotes the old quote, stores a new quote, and returns `CUSTOMER_ACTION_REQUIRED`; the customer must explicitly confirm before another readiness evaluation.

If the active release changed, the immutable release binding prevents silent migration. The application enters `CONFIGURATION_CHANGED`; a newly configured application is required. Earlier quote/legal rounds remain unchanged. Current legal acceptance is append-only and copied only from the current accepted round.

On success finalization creates exactly one Booking, pricing snapshot, insurance snapshot, customer/driver snapshot, Booking legal rows, and approved-document bindings; it consumes the matching upload session and marks the application `FINALIZED` in the same transaction. Deferred database constraints verify the aggregate before commit. Serialization conflicts return a reload-safe conflict code. Concurrent requests converge on the same Booking.

## Explicit Booking field mapping

| Application evidence | Booking result |
| --- | --- |
| `carId` | `Booking.carId` |
| `pickupAt`, `returnAt` | `pickupDate`, `dropoffDate` |
| equal pickup/return location | `Booking.location` |
| current confirmed quote | Booking totals and `BookingPricingSnapshot` |
| quote currency | pricing and insurance snapshots |
| payment selection | `paymentMethod`, deposit amount |
| validated customer/driver | `BookingCustomerDriverSnapshot` |
| insurance selection | `BookingInsuranceSnapshot` |
| exact release IDs | immutable snapshot provenance |
| current legal round | `BookingLegalAcceptance` rows |
| current approved documents | `CustomerDocument.bookingId` and consumed session |

The executable mapping contract is `BOOKING_APPLICATION_TO_BOOKING_MAPPING` and is covered by tests.

## Document policy administration

`/{locale}/admin/business-configuration/documents` replaces the placeholder with a restricted typed policy editor. It supports:

- ID card/passport choice;
- driving licence;
- front/back or single file;
- required/optional/disabled;
- one or two files maximum;
- customer instructions;
- mandatory manual review (fixed on, not bypassable);
- retention preference from 1 through the 365-day hard maximum.

Saving validates cross-field identity semantics, creates a new immutable `DOCUMENT_POLICY` version, copies restricted role permissions, and links it only to an existing draft release. It never edits the live or historical version. The page exposes release validation and non-production environment health codes.

## Protected worker entry points

`POST /api/internal/phase8fb/[job]` supports:

- `application-expiry`;
- `abandoned-upload-cleanup`;
- `review-backlog`;
- `stale-review`;
- `retention-processing`;
- `deletion-processing`;
- `failed-deletion-retry`;
- `orphan-reconciliation`.

Jobs require an exact bearer secret, explicit `PHASE8FB_WORKERS_ENABLED=true`, a supported job name, and a rate limit. The route hard-denies `NODE_ENV=production`. No schedule is configured. Retention/deletion discovery remains evidence-first; destructive provider processing is not enabled for production.

## Rate limits

Bounded non-production limits protect application creation (5/min), updates (30/min), upload intent/completion (20/min), invalid upload retries (8/10 min policy), secure access (30/min), review decisions (30/min), finalization (5/min), and workers (10/min/job). The current bounded in-process store is intentionally a production blocker; production approval must provide a shared atomic backend before multi-instance enablement.

## Tests and validation

Added tests cover the application service boundary, exact location behavior, ownership, optimistic conflict, refresh recovery, cancellation, concurrent idempotent finalization, database gates, checkout non-creation of Booking, route presence, finalization locks/snapshots, reauthentication, and production guards. Existing document tests continue to cover technical validation, manual review, rejection/replacement, access, recent authentication, retention, provider adapters, and non-production integration guards.

Disposable PostgreSQL verification from the schema gate covers expiry, price renewal, legal evidence, atomic rollback constraints, availability/finalization consistency, and a two-connection exactly-one-Booking race. The provider integration harness remains synthetic and isolated. Playwright is not installed in this repository; browser verification uses the available local browser harness and is recorded with the final validation results.

Final non-production validation on 2026-07-13:

- Prisma schema validation passed and all 31 migrations replayed successfully on disposable PostgreSQL 16;
- the approved synthetic Phase 8F-B fixture and lifecycle/concurrency verification passed;
- TypeScript passed;
- all 39 test files and 271 tests passed;
- scoped Phase 8F-B ESLint passed with zero errors (the touched legacy checkout retains two pre-existing warnings);
- repository-wide ESLint remains at its pre-existing baseline of 30 errors and 27 warnings outside this phase;
- the optimized Next.js production build passed;
- the customer application was checked at desktop and 390-pixel mobile widths, and the restricted review screen at 390-pixel mobile width, with no horizontal overflow or runtime error overlay;
- the temporary synthetic preview routes were removed after verification and are not part of the production artifact.

## Production provisioning blockers/checklist

Production remains blocked until separately approved work provides and verifies:

- a private production Blob store in the approved region and project;
- OIDC-only runtime access, private-access and region attestations, and no static token;
- a shared atomic rate-limit backend;
- explicit reviewer/downloader/security/retention role assignments and exact policy permissions;
- operational recent Google reauthentication;
- confirmed retention/legal policy and deletion runbook;
- production worker deployment, secrets, monitoring, retry alerts, and schedules;
- backlog/stale-review, audit-persistence, cleanup, deletion, and orphan-reconciliation alerts;
- synthetic production-readiness rehearsal with no real identity data;
- security/privacy review and explicit production-provisioning approval;
- review and upgrade Next.js 16.0.10 to the current supported stable release before production release.

Until those items are approved, private-document production workflows, Blob provisioning, and schedules must remain disabled.
