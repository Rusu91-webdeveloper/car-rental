# Phase 7 — Legal publication and booking acceptance

## Outcome and boundaries

Phase 7 adds typed Rental Terms and Privacy Notice administration, immutable publication, localized booking presentation, explicit customer acknowledgement, and historical acceptance evidence. It does not add private document uploads, storage providers, malware scanning, payments, confirmation-template administration, signatures, or PDF generation.

The implementation preserves legacy checkout when no active release exists or when `bookingEnforcementEnabled=false`. It does not fabricate historical publication validation or booking provenance.

## Additive schema migration

Migration `20260713100000_add_phase7_legal_provenance` adds:

- `DISABLED` to `LegalAcceptanceRequirement` and the `LegalContentPresentation` enum;
- primary-locale and validation provenance to legal versions and translations;
- enforcement, locale, presentation, confirmation, and localized-label fields for Legal Acceptance configuration;
- the typed `LegalAcceptanceTranslation` child model;
- nullable exact release/configuration provenance on historical `BookingLegalAcceptance` rows;
- relations and indexes required by those fields.

Database checks and triggers enforce new-publication provenance, valid localized released policies, active-release workflow compatibility, active-publication archive protection, immutable localized configuration, affirmative append-only booking acceptance, and deferred booking/release/config/document/locale/hash consistency. True no-op updates are allowed only to schedule deferred checks; released business payload changes remain blocked.

The migration backfills acceptance provenance only when a non-compatibility pricing snapshot, release policy, exact document, locale, type, version, and content hash all agree. Ambiguous rows remain null.

## Routes and components

Routes:

- `/[locale]/admin/business-configuration/legal` — legal administration inside the existing admin shell;
- `/[locale]/legal/[translationId]` — public immutable historical rendering for an exact published/archived translation;
- existing checkout, customer bookings, and admin booking routes now render Phase 7 behavior/evidence.

Components:

- `LegalDocumentList` and its draft editor, language navigation, safe preview, validation/publication actions, and history;
- `LegalAcceptanceConfigurationForm` for exact publications, independent requirements, labels, locales, presentation, retention, and confirmation behavior;
- `LegalContent`, shared by admin preview, checkout inline presentation, and public historical rendering.

## Content representation and safety

Canonical legal content is normalized plain text. Rendering escapes HTML metacharacters and only produces paragraphs and line breaks. Raw HTML, script/iframe tags, event handlers, `javascript:` and `data:text/html` payloads, and template expressions are rejected. URLs remain inert text in rendered legal content. No broad rich-text or executable-template dependency was introduced.

SHA-256 hashes are calculated from normalized canonical text. A deterministic manifest hash covers the sorted locale/hash set. Validation snapshots are bounded to stable codes, severity, locale, field, validator version, and remediation; they contain no full legal text, customer data, secrets, or raw database errors.

## Draft, translation, and publication lifecycle

Authorized editors can create an initial draft or clone a published version, edit its primary locale and supported translations, preview the customer renderer, validate, and discard. All saves use optimistic revisions.

Publishing requires `legal.publish`, reloads and locks the draft in a serializable transaction, reruns validation, recalculates hashes, records validator/publisher provenance, transitions the complete translation set to immutable `PUBLISHED` state, and writes a safe audit event. Publishing never activates a Business Configuration release. Corrections require a new version. A publication used by the active release cannot be archived.

Validation covers required title/content, meaningful length, supported and normalized locales, duplicate locales, primary translation, required booking languages, content safety, and deterministic hashes. It does not evaluate legal sufficiency; the admin page displays the required professional-review notice.

## Legal Acceptance configuration and release integration

The typed configuration selects exact published Rental Terms and Privacy Notice versions. Requirements are independent: `REQUIRED`, `DISPLAY_ONLY`, or `DISABLED`. Each required locale has plain-text link labels and, for required actions, separate checkbox labels. `INLINE` and `DIALOG` change presentation only.

Draft editing and label replacement use optimistic locking. Validation checks exact publication status/type, required locale coverage, supported locales, localized labels, and booking-workflow compatibility. The existing release draft is updated with the exact policy version; existing validation and activation services remain the only activation mechanism.

When enforcement is disabled, the Legal step remains hidden and no acceptance is created. When display-only content is enabled, the step is visible but no acceptance row is fabricated. Any required legal action requires a required Legal workflow step. Release validation and database activation checks block incomplete or conflicting policies.

## Booking and historical evidence

The server resolves the active release, exact policy, exact published translations, canonical content, and hashes for the booking locale. It rejects missing locale/publication evidence and does not silently fall back. The browser submits only two acknowledgement booleans; unknown publication IDs, hashes, locales, and timestamps are ignored.

Required controls start unchecked. Terms and Privacy Notice are separate. Opening a link or continuing is never acceptance. `DISPLAY_ONLY` produces no acceptance row.

Inside the same serializable transaction as Booking and the pricing, insurance, and customer/driver snapshots, the service writes one affirmative `BookingLegalAcceptance` per required document with:

- exact release and Legal Acceptance configuration provenance;
- exact immutable translation, document type, version, locale, and hash;
- booking customer association;
- `CUSTOMER_CHECKBOX` source and a server timestamp;
- canonical content only when snapshot retention is enabled.

Any validation or persistence failure rolls back the Booking. Legacy mode creates no legal evidence.

Customer booking history and confirmation emails show safe version/timestamp references, not hashes or full legal text. Admin booking evidence includes exact provenance and a recomputed hash-verification state. Historical rendering queries the stored acceptance relation and immutable translation; it never consults current legal settings.

## Authorization, auditing, health, and concurrency

Server actions enforce `configuration.view`, `legal.edit`, `legal.publish`, `configuration.validate`, and existing release activation capabilities through persisted capability checks with legacy ADMIN compatibility. View-only users receive read-only UI.

Safe append-only audit events cover draft creation/edit/discard, validation, publication/archive, policy changes, and release attachment. Metadata contains identifiers, types, versions, locales, issue codes, revisions, and changed field names—not legal bodies or customer PII.

Health and release validation report missing publications/translations, invalid policies, workflow conflicts, draft changes, and `LEGAL_READY`. Optimistic revision checks reject stale document and policy edits; advisory locking plus serializable publication gives one publication winner; database uniqueness and immutability prevent duplicate or partial publication.

## Verification evidence

Disposable PostgreSQL 16 on localhost only was used for:

- full replay of all 21 migrations from empty;
- safe second deploy with no pending migrations;
- representative pre-Phase-7 replay preserving published rows and acceptances with nullable provenance;
- exact-provenance behavior and no ambiguous backfill;
- application publication, policy validation, release activation, and future booking integration;
- unchecked acknowledgement rejection with no Booking write;
- two exact acceptance rows and server timestamps;
- false-evidence transaction rollback;
- published translation, released label, and acceptance immutability;
- active-publication archive rejection;
- historical acceptance stability after a newer publication;
- zero Prisma migration/schema diff.

Unit coverage includes content normalization/hash determinism, safe rendering, unsafe markup and scheme rejection, locale/translation validation, disabled compatibility, display-only behavior, required workflow conflicts, and migration safeguards. The final suite contains 26 test files and 161 tests.

Visual verification confirmed the public exact-version page at desktop and 390×844 mobile sizes. Layout, hierarchy, wrapping, and safe plain-text rendering were correct. Admin and authenticated checkout verification reached the existing Google sign-in boundary; no authentication bypass was added, so those authenticated screens remain a documented visual limitation.

Validation commands completed: Prisma format/validate/generate, TypeScript, Vitest, scoped ESLint, production build, migration replay/diff, and `git diff --check`. Existing `<img>` and checkout hook warnings remain unrelated; scoped ESLint reported no errors.

## Files and commit groups

Implementation is grouped around:

1. approved additive schema and migration protections;
2. legal content safety, validation, repositories, services, authorization, and audit flows;
3. admin publication and Legal Acceptance configuration UI;
4. checkout persistence, exact public rendering, history/admin/email evidence, health, and release integration;
5. disposable integration/unit tests and this evidence document.

Exact commit hashes are recorded in the Phase 7 completion report and repository history. `.graphifyignore` and `graphify-out/` remain unmodified and uncommitted.

## Known limitations and Phase 8 readiness

- Authenticated visual verification requires an existing signed-in browser session; the current environment redirected to Google sign-in.
- Plain text is intentionally less expressive than restricted Markdown or rich text.
- Privacy Notice acknowledgement is not described as consent and no marketing consent purpose is implemented.
- Historical pre-Phase-7 provenance remains nullable unless exact release-backed evidence exists.

Phase 8 still requires separate approval and decisions for private customer-document storage, provider/region/key design, access/download controls, encryption, malware scanning/quarantine, retention/deletion, and operational incident handling. None of those features are part of Phase 7.
