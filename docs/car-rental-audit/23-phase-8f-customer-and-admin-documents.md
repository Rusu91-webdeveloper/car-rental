# Phase 8F-B — Booking application schema and migration gate

Date: 2026-07-13. Status: **schema/migration implemented and verified; stopped before UI and service integration as required**.

Phase 8F-A remains approved and unchanged. This phase is additive. It did not create customer/admin UI, upload or worker routes, schedules, production resources, role assignments, real document objects, or production data. No production, staging, shared, repository-configured, or personal-data system was contacted.

## Outcome

The approved pre-booking aggregate is now represented by typed Prisma models and a forward-only migration:

- `BookingApplication` owns the recoverable customer journey before a `Booking` exists;
- typed customer/driver, insurance, payment, pricing-quote, and legal-acceptance evidence belongs to that application;
- `DocumentUploadSession.bookingApplicationId` provides the nullable, historical-compatible one-to-one document-session binding;
- a `Booking` is still created only during finalization;
- historical Booking, snapshot, legal, document, review, audit, and upload-session rows are not backfilled or inferred.

Implementation files:

- `prisma/schema.prisma`;
- `prisma/migrations/20260713140000_add_phase8fb_booking_application/migration.sql`;
- `scripts/phase8fb-booking-application-fixture.sql`;
- `scripts/phase8fb-booking-application-verification.sql`.

## Implemented lifecycle

`BookingApplicationStatus` contains:

- `DRAFT`;
- `AWAITING_DOCUMENT_UPLOAD`;
- `AWAITING_DOCUMENT_REVIEW`;
- `CUSTOMER_ACTION_REQUIRED`;
- `READY_TO_FINALIZE`;
- `FINALIZING`;
- `FINALIZED`;
- `EXPIRED`;
- `CANCELLED`;
- `REJECTED`.

`FINALIZED`, `EXPIRED`, `CANCELLED`, and `REJECTED` are immutable terminal states. Database triggers enforce the allowed transition graph, monotonic optimistic revision, expiry, terminal metadata, and the one-winner finalization claim.

`BookingApplicationActionReason` provides stable customer-action reason codes:

- `PRICE_CHANGED`;
- `VEHICLE_UNAVAILABLE`;
- `CONFIGURATION_CHANGED`;
- `LEGAL_VERSION_CHANGED`;
- `RENTAL_DATES_CHANGED`;
- `INSURANCE_CHANGED`;
- `PAYMENT_RULES_CHANGED`;
- `CUSTOMER_DATA_INVALID`;
- `DOCUMENT_REPLACEMENT_REQUIRED`.

The application's release identity is immutable. A change that needs a different Business Configuration release must create a new application; an existing application never silently follows a newly activated release.

## Aggregate and provenance

`BookingApplication` stores:

- authenticated customer and selected vehicle;
- locale, pickup/return UTC timestamps, separate pickup and return locations, and the release business time zone;
- payment method, lifecycle status, revision, idempotency key, activity/expiry/submission/readiness/finalization timestamps, and reason evidence;
- exact `BusinessConfigurationRelease` ID;
- exact general, pricing, fleet-rate, insurance, customer-driver, workflow, document, payment, confirmation, and legal configuration IDs from that release;
- legal acceptance round;
- nullable unique final `bookingId`.

The database rejects an application whose duplicated provenance IDs or business time zone do not exactly match its release. Customer, vehicle, release, configuration membership, idempotency identity, and creation identity are immutable. Rental facts and payment method may change only through revision-checked customer-action paths.

The current `Booking` schema has one `location` field. The application deliberately stores both pickup and return locations so the customer journey does not lose information. Phase 8F-B finalization currently requires the Booking location to equal the application pickup location; a future separately approved Booking destination migration would be needed to persist a distinct return location on the final Booking itself.

## Typed child state

`BookingApplicationCustomerDriver` is a one-to-one typed record with nullable progressive-entry fields, licence-held-since evidence, validator version, validation result/timestamp, capture timestamp, and optimistic revision. Readiness requires `VALID` or `WARNING` validation under the application's exact customer-driver configuration.

`BookingApplicationInsuranceSelection` is a one-to-one quote-time insurance snapshot. It retains selection, requirement mode, displayed name/description, unit price, billable days, quoted subtotal, currency, tax treatment, availability scope, presentation facts, selected time, exact insurance version, and revision.

`BookingApplicationPaymentSelection` is a one-to-one payment choice. It retains both the Booking payment method and configured payment mode, exact payment version, optional exact localized instruction, deposit type/value, quoted amount/rate, currency, selected time, and revision. It intentionally stores no payment or settlement evidence.

All three records are mutable only while their application is in a pre-readiness active state, must begin at revision one, use the next revision on update, and must reference the exact configuration IDs bound to the application.

## Historical pricing quotes

`BookingApplicationPricingQuote` retains every price the customer was shown, including exact release/pricing/fleet/rate provenance, version numbers, engine/source metadata, duration/billing decomposition, source rates, subtotal/insurance/adjustment/tax/grand total, calculation trace, quote expiry, and customer-confirmation evidence.

Protections include:

- one current quote per application by partial unique index;
- monotonic per-application quote versions;
- renewed quotes must point to the immediately prior demoted quote;
- exact release, pricing, rate-set, vehicle-rate, vehicle, currency, and source provenance;
- owner-only, database-receipted confirmation;
- immutable quote facts after insertion, with only current-quote demotion and first owner confirmation allowed;
- no quote deletion.

A price change moves the application to `CUSTOMER_ACTION_REQUIRED`, preserves the old quote, and requires a new current unexpired customer-confirmed quote before readiness can be restored.

## Append-only application legal evidence

`BookingApplicationLegalAcceptance` retains:

- application and acceptance round;
- exact legal document version and exact translation;
- customer, release, and legal-policy version;
- document type/version, locale, content hash, affirmative result, database receipt time, source, and required content snapshot.

The migration rejects updates and deletes. Inserts must belong to the application owner and current round, match the application's immutable release/policy, match the policy's exact document version, and exactly match the published translation type/version/locale/hash/content. Historical rounds remain queryable.

## Document-session binding and upload expiry

`DocumentUploadSession.bookingApplicationId` is nullable and unique. Historical sessions remain null. A new binding is allowed only on an open session, uses the next session revision, and becomes immutable.

The extended session trigger requires equal customer, vehicle, dates, locale, release, and document-policy provenance. A consumed session must match both the authoritative Booking evidence and an application in `FINALIZING` with the same Booking.

A separate upload-intent guard rejects new or changed upload intents whenever a bound application is not in an upload-permitting state or has reached its application expiry, even if the document session's own expiry has not yet elapsed.

## Database readiness and finalization gates

`READY_TO_FINALIZE` and the claim of `FINALIZING` call the database readiness assertion. It requires:

1. an unexpired active application;
2. valid typed customer/driver evidence under the exact configuration;
3. internally consistent insurance evidence under the exact configuration and currency;
4. an enabled exact payment method and consistent deposit quote;
5. exactly one current, unexpired, owner-confirmed price quote with exact pricing provenance;
6. required current-round terms/privacy evidence under the exact legal policy;
7. one open, unexpired, exactly matching document session;
8. every required document slot/side to have current retained evidence with exact provenance and either clean scanner evidence or approved manual-review evidence;
9. correct `EITHER_IDENTITY_CARD_OR_PASSPORT` semantics when configured.

Finalization is checked again by a deferred constraint trigger so the Booking, pricing snapshot, customer/driver snapshot, insurance snapshot, legal evidence, application, and consumed document session can be created/linked atomically in one transaction. The trigger verifies ownership, vehicle, dates, pickup location, payment method, release, current quote total, snapshot provenance/content, copied current-round legal evidence, and the consumed session/Booking identity.

The final service must still recalculate availability and lock the vehicle in its serializable finalization transaction. This schema does not reserve vehicle availability while manual review is pending.

## Disposable PostgreSQL verification

The complete 30-migration chain was replayed from empty state on a fresh local PostgreSQL 16 database. The standalone synthetic fixture and verification then exercised:

- exact release-provenance rejection;
- typed child and document readiness;
- append-only exact legal evidence;
- rejection of readiness before quote confirmation;
- database-receipted owner confirmation;
- price-change quote demotion, history retention, renewal, and reconfirmation;
- stale revision rejection;
- a two-connection finalization race with exactly one winner;
- atomic Booking/snapshot/legal/session/application finalization;
- immutable finalized state;
- application expiry blocking a new upload while its session remains open.

The verification uses only `*.invalid` identities and metadata-only document records. It creates `dblink` only inside the disposable verification database to drive the two-connection race; the application migration does not install or depend on that extension.

## Required stop before UI

The additive schema/migration phase is complete. Per approval, work stops here before:

- customer application persistence actions and checkout recovery;
- customer upload/status/replacement UI and routes;
- final booking service integration;
- admin review/document-policy/hold/deletion screens;
- worker Route Handlers or schedules;
- Playwright and visual UI verification;
- any production provisioning or release activation.

Those items require explicit approval of the implemented Prisma/SQL diff and authorization to continue Phase 8F-B beyond this schema gate.
