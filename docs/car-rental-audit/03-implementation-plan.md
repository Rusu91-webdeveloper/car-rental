# Business Configuration Implementation Plan

Status: Phase 1 through the approved Phase 5 Pricing and Billing administration experience are complete as of 2026-07-12. The migration chain, pricing compatibility, booking concurrency, draft concurrency, release activation, audit, runtime pricing, and historical-snapshot preservation were verified only on disposable PostgreSQL 16 with synthetic data; no production, staging, shared, repository-configured, or personal-data database was contacted. Synthetic releases were activated only in disposable verification. Work is stopped at the Phase 6 approval gate. Evidence is recorded in `07-phase-1-foundation.md` through `12-phase-5-pricing-and-billing-admin.md`.

The current application has one mutable `CompanySettings` singleton, one mutable daily `Car.price`, two roles, and a daily-only booking calculation inside `createBooking()` (`prisma/schema.prisma`, `app/actions/bookings.ts`, `lib/auth.ts`). The Graphify report also places booking/pricing/email concerns in one cluster and identifies the large `AdminDashboard()` boundary (`graphify-out/GRAPH_REPORT.md`, `docs/car-rental-audit/04-architecture-graph-summary.md`). The design below therefore introduces domain services and feature pages instead of adding more behavior to the existing settings action, booking action, or admin client.

The complete model proposal, invariants, route map, migration plan, test plan, file map, commit sequence, and approval decisions are in `06-rental-settings-architecture.md`.

## Architecture decision

Use **independently versioned configuration domains with an atomic release manifest**.

- Nine domain boundaries balance independent drafting/audit with cross-domain safety: general rental, pricing and billing, insurance, customer and driver requirements, booking workflow, document policy, payments, confirmations, and legal acceptance policy.
- Driver and customer information are one domain because age/licence rules make particular customer fields mandatory together.
- Pricing and billing are one policy domain because billable duration, rate selection, tax, discounts, deposits, and quote totals must validate together. Fleet rates use an immutable rate-set revision referenced by the release.
- Legal text keeps its own immutable publication lifecycle. The legal-policy domain selects published documents and acceptance behavior; it does not contain editable legal text.
- An activated `BusinessConfigurationRelease` records the exact domain versions, fleet-rate set, and published legal dependencies used for future bookings. Activation validates the complete combination in one serializable transaction.
- Domain versions may be drafted and validated independently, but never become customer-effective independently. Rollback clones earlier domain selections into a new release candidate and activates a new release; history is never rewritten.

This avoids both failure modes in the earlier proposal: one oversized `RentalSettingsVersion` and mutable vehicle rates with weak historical provenance.

## Delivery phases

### Phase 1 — Quality and contract foundation

Add ESLint flat configuration compatible with Next.js 16, `typecheck`, Vitest unit tests, PostgreSQL integration-test conventions, Playwright E2E configuration, and CI scripts. Add code-only domain types, Zod contracts, capability names, release compatibility validation interfaces, and snapshot schemas. No customer behavior change. Risk: Medium.

Completed with one deliberate deferral: Playwright and browser configuration remain for the first customer/admin UI phase because Phase 1 introduced no UI behavior or meaningful E2E scenario. ESLint, Vitest, Prisma-independent domain/version contracts, runtime domain/release validation, capability evaluation, configuration health, and unit-test boundaries are implemented. CI workflow and database integration execution remain dependent on the approved CI/database environment; the test layout is future-compatible without connecting to a database.

### Phase 2 — Additive database contracts

After presenting the exact Prisma/schema diff and receiving migration approval, add domain-version tables, release manifests, immutable fleet-rate sets, legal publications, capabilities, audit events, nullable booking snapshot/evidence relations, customer-document metadata, and outbox contracts. Validate schema and rehearse the complete historical migration chain on a disposable PostgreSQL database. Risk: Critical.

Phase 2A produced the exact review proposal. Phase 2B then implemented the approved additive design with shared configuration lifecycle metadata, nine typed payload tables, explicit atomic-release foreign keys, a separate immutable fleet-rate set, normalized optional booking evidence, a separate legal publication lifecycle, capability shadow tables that preserve legacy `ADMIN`, append-only audit events, and private-document metadata only. Six forward migrations, trigger/check SQL, stable reference data, a separate idempotent `Car.price` compatibility backfill, and database verification scripts replay cleanly on disposable PostgreSQL 16. No release, legal publication, fleet-rate set, runtime authorization path, pricing path, route, action, email, or UI was activated. See `09-phase-2b-schema-and-migrations.md`; Phase 3 requires separate approval.

### Phase 3 — Pricing service and compatibility path

Implement one pure integer-cent pricing engine and server quote service. Seed a daily-only fleet-rate set from `Car.price`, preserve the current started-24-hour/minimum-one-day behavior as the compatibility policy, and dual-read/compare before switching booking creation. Store complete pricing and insurance snapshots. Risk: Critical.

Completed within the approved narrower Phase 3 scope: one server-authoritative integer-minor-unit engine now owns duration, daily/weekly/fixed-month strategies, tax arithmetic, payment amount derivation, source resolution, trace generation, and immutable pricing snapshot mapping. With no ACTIVE release it reads only `Car.price`; an inactive compatibility `FleetRateSet` is ignored. Customer quote display calls the server, and booking creation recalculates after the car lock, then writes Booking and `BookingPricingSnapshot` atomically. Existing bookings without snapshots remain readable. Insurance remains a zero-valued extension point and no release was activated. See `10-phase-3-pricing-engine.md`.

### Phase 4 — Business Configuration shell and health overview

Create `/[locale]/admin/business-configuration` with Overview, Pricing, Billing Rules, Insurance, Driver Requirements, Customer Information, Booking Flow, Documents, Payments, Legal, Confirmations, and Advanced pages. Keep secrets/infrastructure under a separate `/[locale]/admin/system-settings` boundary. Implement server-produced health findings and draft/live badges. Risk: High.

Completed within the approved Phase 4 scope. The server-rendered shell and overview use persisted capabilities, repository/service boundaries, configuration health and coverage summaries, exact draft/live comparisons, validation, preview, explicit warning acknowledgement, serialized activation, and append-only audit events. Section routes are honest capability-protected placeholders; Pricing and Billing Rules expose read-only fleet evidence only. No Phase 5 editing forms, rates, mixed-duration controls, or mutable configuration behavior were added. See `11-phase-4-business-configuration-shell.md`.

### Phase 5 — Pricing, billing, and fleet rates

Add immutable rate-set drafts, per-vehicle daily/weekly/monthly rates, fleet warnings, mixed-duration radio cards, plain-language examples, and server-generated quote/impact previews. Activation remains release-atomic. Risk: High.

Completed within the approved Phase 5 scope. Administrators can create/resume/discard pricing and fleet drafts, edit exact per-vehicle rates, use bounded bulk actions, configure supported pricing and billable-duration rules, compare live/draft values, generate Phase 3 server quotes, validate fleet-wide coverage, attach the exact drafts to the existing release, and explicitly activate only through the Phase 4 workflow. Calendar months remain hidden and blocked. No customer pricing selector or Phase 6 domain form was added. See `12-phase-5-pricing-and-billing-admin.md`.

### Phase 6 — Insurance, customer, driver, and booking workflow

Add Vollkasko configuration, typed field requirements, eligibility validation, safe supported booking-step states, public configuration DTOs, and booking snapshots. Invalid combinations are rejected server-side even when UI controls are bypassed. Risk: Critical.

### Phase 7 — Legal publication and acceptance

Implement translated legal drafts, validation, immutable publication, archival, release selection, checkout acceptance, and append-only booking evidence. Published content is never editable. Risk: Critical.

### Phase 8 — Private documents

Only after provider/region/scanner approval, implement the private-store adapter, local development adapter, quarantine/finalization, file-signature and MIME validation, malware scan state, short-lived authorized access, access audits, retention, deletion, and least-privilege document capabilities. Risk: Critical.

### Phase 9 — Payments and confirmations

Expose only implemented payment modes, validate deposit/balance/review combinations, and render typed/sanitized confirmation content from the booking snapshot. Provider credentials remain System Settings/environment concerns. Risk: Critical.

### Phase 10 — Booking orchestration and hardening

Move booking creation behind an orchestrator that loads one active release, rechecks availability and policy inside a serializable transaction, recalculates server-side, persists all evidence, retries serialization failures, and writes an outbox event. Add overlap protection if the supported PostgreSQL deployment accepts the proposed exclusion constraint. Complete integration/E2E/security/migration/restore tests before compatibility cleanup. Risk: Critical.

## Approval and migration gate

Implementation must stop again before the first database migration. At that point the exact generated Prisma diff and SQL will be shown with compatibility, recovery, lock/downtime, and backfill notes; `prisma validate` and a clean replay must pass. No destructive migration, database reset, fabricated historical acceptance, or production migration is authorized by this plan.

Owner decisions still required before the affected phases are listed in section 14 of `06-rental-settings-architecture.md`. Business values such as rate amounts, enabled fields, and confirmation choices belong in drafts and do not block the foundation; storage region, legal authority, hard retention limits, payment integrations, security roles, and production database constraints do.
