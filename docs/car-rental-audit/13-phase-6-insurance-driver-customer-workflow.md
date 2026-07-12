# Phase 6 — Insurance, driver, customer, and booking workflow

## Outcome

Phase 6 adds release-versioned administration and active-release runtime behavior for insurance, driver eligibility, supported customer/driver fields, and the typed booking workflow. It preserves legacy behavior when no active release exists and fails safely instead of falling back when an active release is invalid.

No document upload, legal editing/publication, payment configuration/provider, confirmation-content administration, or storage integration was added.

## Additive migration

Migration `20260713003000_add_phase6_snapshot_provenance` adds the approved selection, currency, vehicle-availability, confirmation-visibility, validation-time, and configuration-provenance fields. It adds inverse Prisma relations, indexes, foreign keys, selection and availability checks, uppercase three-character currency validation, and deferred cross-snapshot/release consistency triggers.

Existing customer/driver snapshots receive a configuration version only when their non-compatibility pricing snapshot identifies an exact release. Validation time is not invented. Historical optional-insurance UI behavior cannot be proven from the old schema and is not fabricated; such a row makes the migration stop for explicit review. Disabled or mandatory historical insurance can be backfilled only when the stored selection and exact release evidence agree.

Disposable PostgreSQL verification covered:

- full replay of all 20 migrations from empty;
- a second safe deploy with no pending migrations;
- replay over synthetic release-backed and compatibility records;
- preservation of nullable legacy provenance;
- exact-only insurance and customer/driver backfill;
- selection, availability, currency, release-provenance, foreign-key, and index behavior;
- zero Prisma schema-to-migration diff.

`Car.price` was not modified.

## Administration

Routes:

- `/admin/business-configuration/insurance`
- `/admin/business-configuration/driver-requirements`
- `/admin/business-configuration/customer-information`
- `/admin/business-configuration/booking-flow`

Each route is read-only without its narrow edit capability. Domain drafts support create-from-live/default, optimistic revision-checked edits, validation, live/draft comparison, safe discard, and exact attachment to the existing release draft. Saving or validating never activates a configuration; activation remains the explicit Phase 4 release action.

Insurance controls cover enabled state, optional/mandatory mode, customer text, integer-minor-unit per-billable-day price, inherited/included/excluded tax marker, all/selected vehicle availability, confirmation visibility, visible customer selection, and preselection. The example selected/unselected quote is produced by the pricing engine on the server. Preselection is described and stored as initial UI-state evidence, not consent evidence.

Driver controls cover calendar-aware minimum/maximum age, minimum licence-holding months, rental-end licence validity, and allowlisted issuing countries. Customer fields use the closed approved field vocabulary and Required/Optional/Hidden modes. System identity/communication requirements and active driver dependencies override unsafe hidden choices with an explanatory reason.

The workflow editor uses only approved typed steps. Vehicle/dates, customer, driver, review, and confirmation remain required. Documents and legal acceptance remain visibly unavailable and hidden. Insurance must agree with the insurance domain. Existing transfer and pay-at-pickup behavior remains the supported payment/request step.

## Runtime and booking behavior

`resolvePublicBookingConfiguration` reads the exact active `BusinessConfigurationRelease`. Without an active release it returns legacy mode with no new fields or insurance. With an active release it verifies release/domain lifecycle state, effective fields, workflow compatibility, insurance price, currency, and vehicle availability.

The field resolver is shared by public rendering and server validation. Hidden submitted values are ignored, visible values are normalized, country codes are uppercased, and required/format failures block booking. Driver eligibility uses calendar dates in the business timezone, not elapsed milliseconds, and returns stable codes for age, issue/expiry, holding-period, issuing-country, impossible-date, and missing-rule outcomes.

The configured quote service calls the Phase 3 pricing resolver and engine. Insurance quantity is the authoritative billable-day count. The browser supplies only a selection request; subtotal and eligibility claims are never accepted. Mandatory insurance is included, disabled or unavailable selection is rejected, and currency/tax treatment flow through the pricing engine.

Booking creation locks the vehicle, rechecks availability, resolves and validates the active release, recalculates the full quote, and writes Booking, pricing snapshot, customer/driver snapshot, and insurance snapshot in one serializable transaction. Any snapshot failure rolls back the booking. Every new active-release customer/driver snapshot has the exact configuration ID and `validatedAt`; every insurance snapshot has exact configuration, currency, availability source, selection-state, and confirmation-visibility evidence.

## Historical rendering and PII

Customer booking history, the success confirmation, and booking emails use `BookingInsuranceSnapshot.showInConfirmation` and snapshot values. They never consult current insurance settings for an old booking. The server does not rerun historical driver rules.

Admin booking details show snapshot customer/driver data only behind the existing ADMIN route and the new sensitive-data capability decision. Licence numbers are masked in list/detail output. Date of birth is restricted to the authorized admin view and is not included in email. Audit events contain changed field names, counts, revisions, and outcomes—not submitted customer values or raw payloads.

Current at-rest protection is the PostgreSQL/database access boundary and application authorization. Phase 6 does not claim or add field-level encryption. The legacy ADMIN role remains an all-capabilities compatibility boundary; finer non-admin role assignment is supported by the existing capability tables but requires deliberate role configuration.

## Health, release, authorization, and audit

The overview detects independent Phase 6 drafts as changes and evaluates their real validation issues. Stable health findings cover insurance price/selection/coverage, driver rule and field dependencies, unsupported workflow steps, and cross-domain conflicts. Release validation applies the same workflow/field rules and safely reuses already released fleet rates without mutating them.

Idempotent capability data is provided in `scripts/phase6-capabilities.sql`:

- `insurance.manage`
- `driver-requirements.manage`
- `customer-fields.manage`
- `booking-workflow.manage`
- `customer-sensitive-data.view`

Server actions and repository transactions both recheck capabilities. ADMIN compatibility remains intact. Safe audit events cover draft creation, settings/availability/rule/field/step changes, validation, discard, and release attachment. Optimistic revisions protect every edited Phase 6 domain; multi-row changes and attachment use serializable transactions.

## Tests and verification

Unit coverage includes insurance pricing extension behavior; driver age, leap-day, DST, holding-period, expiry, and invalid-date boundaries; field dependency, normalization, hidden submission, and masking behavior; workflow conflicts and unavailable steps; capability persistence; and additive migration evidence.

`scripts/verify-phase6-integration.ts` exercises a synthetic active release on disposable PostgreSQL: draft creation/edit/validation/attachment/activation, selected and unselected quotes, underage rollback, atomic snapshot persistence, currency/provenance equality, and unchanged historical insurance. `scripts/phase6-constraint-verification.sql` exercises database-level provenance, currency, availability, and selection rejection.

Authenticated browser verification reached the unmodified Google sign-in boundary. No safe test-auth mechanism exists in the repository, so no OAuth identity was inserted and no bypass was added. The four focused component surfaces are covered by source/unit checks; authenticated desktop/mobile page capture remains blocked by the same identity requirement documented in Phase 5.

Validation completed with Prisma format/validate/generate, TypeScript, Vitest, scoped ESLint, production build, migration replay/diff, and `git diff --check`. ESLint reports only the pre-existing image optimization and checkout hook-dependency warnings; there are no lint errors.

## Deferred to Phase 7 or later

The next phase still needs explicit approval and decisions for private document storage/upload/security processing, legal content and acceptance lifecycle, payment configuration/provider behavior, and any confirmation-content administration. Phase 6 deliberately exposes none of those controls as operational.
