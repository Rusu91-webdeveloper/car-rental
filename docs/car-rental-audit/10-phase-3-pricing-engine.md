# Phase 3 — Centralized Pricing Engine

Completion date: 2026-07-12. Scope: pure pricing domain, server quote boundary, runtime source resolution, authoritative booking integration, immutable pricing snapshots, one additive compatibility-snapshot migration, tests, and disposable PostgreSQL verification. No Business Configuration UI, release activation, insurance behavior, legal acceptance, documents, payments integration, configurable steps, or production deployment was performed.

## Mandatory checkpoint and commits

Before runtime edits, `git diff --check`, Prisma validation, typecheck, 48 tests, and the 40-route production build passed. The working tree matched the approved Phase 1 and 2B work. Graphify output remained untracked and was not committed.

Focused baseline commits:

1. `f44447a` — Phase 1 quality tooling and contracts.
2. `4f9c49e` — Phase 2B configuration persistence and migrations.
3. `3bcd83a` — Phase 2B migration verification.
4. `eba0241` — audit documents through Phase 2B.

## Legacy behavior characterized

The former action and checkout duplicated this formula:

1. `days = max(1, ceil(abs(return - pickup) / 86,400,000ms))` after validation requires return after pickup.
2. `subtotal = Car.price × days`.
3. If tax is marked included, tax is zero. Otherwise use a positive configured fractional tax rate, or 10% when zero/missing, then round the product.
4. `total = subtotal + tax`.
5. Transfer deposit and guarantee are separately rounded fractional products of total; pay-at-pickup deposit is zero.

Schema comments, email formatting, car admin conversion, and migration evidence identify `Car.price` and Booking money as integer cents/minor units. Phase 3 does not reinterpret or rewrite them.

The unexplained 10% fallback is an existing compatibility ambiguity. Preserving totals is controlling: the legacy adapter keeps it and emits a warning. It is not copied into or treated as an approved active tax policy.

## Money, currency, rounding, and overflow

- Domain arithmetic accepts integer minor units only.
- Major-unit conversion accepts decimal strings with at most two fractional digits, never floating-point major amounts.
- Currency is uppercase three-letter ISO-style vocabulary. All monetary inputs in a quote must match; no conversion exists.
- The current effective/default project currency is EUR. Existing CompanySettings is loaded and validated when present.
- Division uses named round-half-up arithmetic; basis-point multiplication is the percentage boundary.
- Legacy fractional settings are converted at the adapter to basis points; ambiguous precision is rejected.
- Checked operations reject NaN, Infinity, unsafe integers, negative rates, and overflow.
- Signed values exist only for typed adjustments, which cannot make a quote negative.
- Insurance remains a required-zero extension point.

## Duration semantics

`lib/pricing/duration.ts` requires pickup, return, IANA business timezone, minimum rental minutes, minimum charge days, and grace minutes. It rejects invalid or reversed ranges.

- `STARTED_24_HOUR_PERIODS` preserves elapsed-time compatibility; legacy mode explicitly uses UTC.
- `CALENDAR_DAYS` compares local dates in the business timezone.
- `PICKUP_TIME_BOUNDARY` counts local pickup-time boundaries with grace.

DST spring/autumn behavior is tested for Europe/Berlin. A dedicated `YYYY-MM-DD` adapter preserves date-only semantics. Calendar-month arithmetic is not implemented.

## Pricing strategies

- `DAILY_ONLY`: every chargeable day uses the daily rate.
- `ORDERED_PERIODS`: fixed-month, then weekly, then daily, without searching for a cheaper alternative. It maps to persisted `LONGEST_BLOCKS_THEN_DAYS`.
- `LOWEST_VALID_PRICE`: bounded deterministic search over enabled fixed-month, weekly, and daily combinations, including a period that validly covers a shorter remainder. It maps to `LOWEST_VALID_TOTAL`.

Equal totals prefer fewer total units, more monthly units, more weekly units, then fewer daily units. Optimization is capped at 10,000 days (over 27 years). Disabled rates are excluded; enabled missing/non-positive rates are invalid.

## Architecture and repository boundaries

| Module | Responsibility |
|---|---|
| `errors.ts` | Stable validation, business-rule, operational, and authorization-capable errors. |
| `money.ts` | Safe arithmetic, currencies, conversions, basis points, half-up rounding. |
| `duration.ts` | Timezone-aware structured duration and date-only adapter. |
| `strategies.ts` | Pure daily, ordered, and lowest-valid-price functions. |
| `engine.ts` | Quote components, adjustments, tax, total, trace, and warnings. |
| `repositories.ts` | Prisma-independent rate/configuration/snapshot contracts. |
| `runtime-resolver.ts` | Active-release-first policy and safe legacy fallback. |
| `prisma-repository.ts` | Prisma-only configuration/rate adapter. |
| `quote-service.ts` | Server quote orchestration and payment amount derivation. |
| `legacy-adapter.ts` | Exact current behavior adapter. |
| `snapshot.ts` | Immutable mapping and snapshot-first display helper. |
| `prisma-booking-service.ts` | Serializable lock, availability, quote, Booking + snapshot transaction. |

The application-level interfaces include `VehicleRateRepository`, `ActiveBusinessConfigurationRepository`, `FleetRateSetRepository`, and `BookingPricingSnapshotRepository`. Prisma types stay in infrastructure adapters. Pricing arithmetic is not performed in email, React, or repository code.

## Runtime source precedence

1. Query the single ACTIVE BusinessConfigurationRelease.
2. If present, require valid/warning release state, released/valid pricing and fleet versions, matching currencies, a supported month rule, and a vehicle rate. Use exact immutable IDs.
3. If ACTIVE exists but is invalid, fail safely and never fall back.
4. With no ACTIVE release, load current Car and CompanySettings and use `Car.price` daily-only compatibility mode.
5. The inactive `fleet-rate-set-compat-v1` is not queried, validated, or activated automatically.

Typed failures are logged server-side and projected as safe customer messages without database internals.

## Quote and booking integration

`getBookingQuote()` is an authenticated Server Action used by the existing checkout. It accepts only car, timestamps, and payment method, loads authoritative data, and returns a safe projection. It is not a reservation lock.

`createBooking()` validates and authenticates, then the Prisma booking service:

1. starts a serializable transaction;
2. locks the Car row;
3. rechecks car state and availability;
4. resolves the source and recalculates;
5. persists authoritative Booking scalars;
6. persists the complete BookingPricingSnapshot;
7. commits both or rolls both back.

Browser totals, days, rates, tax, and subtotals are outside the accepted schema and ignored. Serialization conflicts return a safe availability error. Stripe remains disabled. Manual admin reservations remain staff-priced BlockedDate metadata; changing that admin UI is outside Phase 3.

## Snapshot migration and rendering

The Phase 2B snapshot required active-release foreign keys, making a compatibility snapshot impossible while release activation is forbidden. Migration `20260712221500_enable_compatibility_pricing_snapshots`:

- makes release/rate provenance nullable only for compatibility snapshots;
- adds compatibility mode, source type/reference, and strategy;
- defensively backfills any pre-existing release-backed source metadata;
- requires complete release provenance or complete legacy provenance through a CHECK;
- preserves the existing append-only trigger.

Every new Booking receives a snapshot in the same transaction. It records rates, duration, units, strategy, tax, adjustments, zero insurance, total, engine/schema versions, currency, time, source IDs, warnings, payment amounts, and trace. Existing bookings without snapshots remain readable. Customer/admin pages and confirmation emails prefer snapshot total/currency when present, falling back to legacy Booking scalars.

## Files and tests

Changed areas: `lib/pricing/`, booking action, checkout page/client/modal, bookings/admin snapshot projections, email currency rendering, Prisma schema/migration, migration notes, Phase 3 disposable scripts, `tests/unit/pricing/`, and audit documents. The unused duplicated availability day calculator was removed.

Unit coverage includes conversion, rounding, zero/negative/overflow, mixed currency, duration/grace/minimum/date/timezone/DST/date-only cases, every strategy boundary, missing/disabled/invalid rates, ties, optimizer bounds, legacy parity, tax-fallback evidence, runtime precedence, invalid active release, missing vehicle, calendar-month rejection, browser-input stripping, and snapshot mapping/fallback.

Disposable PostgreSQL 16 evidence:

- complete 19-migration replay from zero;
- migrations/schema diff with no difference and up-to-date status;
- valid compatibility snapshot with null release provenance;
- invalid provenance rejected;
- snapshot failure rolled back its Booking;
- valid Booking/snapshot totals and rates matched;
- legacy Booking without snapshot remained readable;
- concurrent overlapping attempts produced one winner and one rejection;
- the winner and snapshot committed together;
- runtime Prisma adapter returned legacy `Car.price` 12,345 for 10 days and the compatibility total 135,795;
- Car.price remained 12,345 and zero releases were ACTIVE.

Only localhost-bound PostgreSQL with synthetic `.invalid` identities was used. No repository database connection was used for migration/integration commands.

Final command results:

| Command | Result |
|---|---|
| `pnpm exec prisma validate` | Pass |
| `pnpm exec prisma generate` | Pass |
| `pnpm exec prisma migrate deploy` against fresh disposable PostgreSQL | Pass; 19 migrations |
| `pnpm exec prisma migrate status` against disposable PostgreSQL | Pass; up to date |
| `pnpm exec prisma migrate diff --from-migrations ... --to-schema-datamodel ... --exit-code` | Pass; no difference |
| `scripts/phase3-pricing-snapshot-verification.sql` | Pass |
| `scripts/phase3-booking-concurrency-verification.ts` | Pass; one winner and one rejection |
| `pnpm typecheck` | Pass |
| `pnpm test:run` | Pass; 13 files, 81 tests |
| Scoped ESLint on all Phase 3 TypeScript/TSX | Pass with nine pre-existing image/exhaustive-dependency warnings and zero errors |
| `pnpm build` | Pass; 40 routes/pages |
| `git diff --check` | Pass |

The build retains the known stale `baseline-browser-mapping` warning and Next.js workspace-root inference warning caused by another home-directory lockfile.

## Limitations and Phase 4 readiness

- The 10% legacy fallback remains visible as a warning until an approved active tax configuration replaces it.
- Active release reads exist, but Phase 3 did not create, validate, or activate a release.
- Calendar months and customer weekly/monthly controls are absent.
- No quote rate limiter was added because the repository has no rate-limit infrastructure; the action is authenticated and validated.
- Existing broad admin/checkout image lint warnings are unrelated to pricing.
- Insurance, customer data/documents, legal acceptance, payments, configurable steps, confirmation content, admin configuration UI, and overlap exclusion DDL remain deferred.

The engine, resolver, quote, snapshot, and fallback are ready for an explicitly approved Phase 4 configuration shell/health phase. Saving a future admin draft must never imply activation.

Phase 3 stops here. Phase 4 requires explicit approval.
