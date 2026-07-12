# Phase 5 — Pricing and Billing Administration

Completion date: 2026-07-12. Scope: complete Pricing and Billing Rules administration, immutable pricing-policy and FleetRateSet drafts, per-vehicle daily/weekly/fixed-month rates, server quote preview, comparisons, health, authorization, audit, concurrency, release integration, tests, and disposable PostgreSQL verification. No insurance, driver, customer-field, booking-flow, document, payment, legal-content, confirmation, customer pricing-selector, calendar-month, dynamic-pricing, coupon, or production-deployment work was performed.

## Routes and components

Two real server-rendered routes replace the Phase 4 placeholders:

- `/[locale]/admin/business-configuration/pricing`
- `/[locale]/admin/business-configuration/billing`

The Pricing page provides version provenance, fleet coverage, searchable/filterable/paginated rate editing, explicit legacy/live copy actions, bounded period-rate bulk actions, per-row validation, changed-from-live markers, server quote comparison, detailed draft/live comparison, and workflow controls.

The Billing Rules page provides plain-language strategy cards, global weekly/monthly availability, fixed 28/30-day month choices, billable-day method, minimum rental minutes, minimum charge days, grace period, business timezone, date-only interpretation, and the approved compatibility tax fields. `CALENDAR_MONTH` is absent from controls and remains a stable activation blocker if introduced outside the UI. Currency is displayed as a release compatibility key and rate-set invariant; Phase 5 performs no currency conversion or silent amount relabeling.

Reusable Phase 5 components include `PricingVersionHeader`, `PricingSummaryCard`, `VehicleRateTable`, row-level rate editors, `MoneyInput`, `PricingStrategySelector`, `BillingRuleForm`, `QuotePreviewPanel`, `DraftLivePricingComparison`, `PricingIssueList`, draft/bulk confirmation controls, and `UnsavedChangesWarning`. The table has an explicit horizontal overflow boundary and the surrounding shell retains its mobile horizontal navigation.

## Repository and service boundaries

Prisma-independent contracts and projections live under `lib/pricing-admin/`. `PrismaPricingAdminRepository` is the only new module that reads or writes Prisma records. The application service owns money parsing, page projection, validation, comparison, quote orchestration, and safe mutation-error mapping.

Implemented operations cover:

- `loadPricingConfigurationPage`
- `createPricingDraft`
- FleetRateSet draft creation from live or legacy prices
- `updateVehicleRate`
- `updateVehicleRatesBulk`
- `updatePricingRules`
- `validatePricingDraft`
- `generatePricingPreview`
- `attachPricingDraftToRelease`
- `discardPricingDraft`

Database capability checks are centralized and reused by Phase 4 validation/activation. Released configuration and FleetRateSet records still have no mutation path and retain the Phase 2B database immutability triggers.

## Draft FleetRateSet behavior

Creating from legacy copies only each non-deleted vehicle's exact `Car.price` into the daily rate. Weekly/monthly values remain null and disabled. Creating from live copies the exact released rate values and enablement flags. Neither action activates or modifies the source.

All edits require `pricing.manage`, run in serializable transactions, compare the expected FleetRateSet revision, invalidate prior validation, and write an allowlisted audit summary. A stale editor receives `OPTIMISTIC_LOCK_FAILED`. Multi-row updates commit fully or roll back fully. Duplicate vehicle rows remain prevented by the existing unique database constraint.

Bulk actions are deliberately bounded to explicit legacy/live copy and weekly/monthly enable/disable. Copy-from-legacy fills vehicles absent from the draft and does not silently overwrite an existing draft rate. Enable actions require existing positive amounts; disable actions explicitly clear the disabled period amount. The UI states selected/affected counts and requires confirmation.

Discard requires an exact confirmation and capability. If drafts are attached, the service safely reattaches a draft release to the active pricing sources before deletion; without a valid base it refuses to remove referenced work.

## Money input

Normal inputs accept major-unit strings and call the Phase 3 integer conversion helpers. `10`, `10.5`, and `10.50` become exact minor units; excessive precision, commas, negatives, malformed values, and unsafe overflow are rejected. Disabled empty weekly/monthly fields are valid; an enabled empty field is not. The UI displays a currency symbol and ISO code but never exposes raw minor-unit editing.

## Pricing and billing rules

The three supported strategies use plain-language labels:

- Charge every rental day separately.
- Use longer rental periods first.
- Automatically use the lowest valid price.

Stored enums remain internal. Ordered and lowest-valid strategies require a globally enabled longer-period rate. Fixed 28/30-day months are supported; calendar months are hidden and blocked. Duration inputs map exactly to the Phase 3 engine's `STARTED_24_HOUR_PERIODS`, `CALENDAR_DAYS`, and `PICKUP_TIME_BOUNDARY` behavior. No new rounding, tax, discount, location, demand, or currency semantics were introduced.

Business timezone remains stored in the General Rental compatibility domain by the approved schema. Phase 5 may clone/update that exact domain version only after pricing drafts are attached to a draft release; it never edits a released version. Currency is kept consistent with the release and FleetRateSet and is not converted.

## Validation, health, and comparison

Stable blockers cover missing drafts, active vehicles missing from the set, missing daily or globally required weekly/monthly rates, mixed release/rate-set currency, unsupported calendar months, and strategies without required period types. Database checks additionally reject non-positive/invalid persisted rates and duplicate vehicles.

Warnings cover no weekly/monthly saving, unusually low/high daily rates, inactive vehicles retained in a draft, active vehicles added after draft creation, and daily-price changes greater than 50% from live. These are structural observations, not financial advice.

The Phase 4 Overview now detects independent pricing drafts before release attachment and projects real rate-set coverage, missing rates, strategy compatibility, blockers, warnings, and draft-change state. Disabled weekly/monthly prices are not reported missing unless their global type is required.

Detailed comparison shows strategy and billing changes; vehicle additions/removals; rate and enablement changes; safe absolute changes; and percentages only when a positive live denominator exists.

## Quote preview and release integration

The preview accepts only vehicle and pickup/return timestamps. The server loads authoritative live/legacy data and exact draft data, then calls the Phase 3 pricing service/engine. React performs no price arithmetic and sends no totals.

The side-by-side result includes chargeable duration, selected strategy, monthly/weekly/daily units, source rates, subtotal, compatibility/configured tax, grand total, currency, warnings, source mode, engine version, and the exact calculation trace. A draft with blockers cannot produce a draft quote.

The exact pricing version and FleetRateSet can be attached to an existing draft release. When an active release exists and no draft exists, attachment clones the other immutable domain references into a new draft manifest and replaces only pricing policy/rates. Validation and activation continue exclusively through the Phase 4 aggregate workflow. Saving or validating never activates.

Phase 4 validation was corrected to skip metadata updates for reused released domains while still validating their payloads. This preserves database immutability when a pricing-only release reuses the other eight domains.

## Authorization and audit

`configuration.view` can view Pricing/Billing routes and previews. Without `pricing.manage`, controls render read-only and every direct mutation remains denied server-side. `pricing.manage` is rechecked inside mutation transactions. `configuration.validate` is required for pricing/release validation; `configuration.activate` remains required by the existing activation service; `security.audit.view` governs audit history.

Allowlisted `PRICING` audit actions cover draft creation, vehicle-rate change, bulk action, strategy/billing change, validation, preview generation, release attachment, and discard. Metadata contains only actors/targets, changed field names, revisions, affected counts, and summarized before/after rates. It contains no customer data, secrets, raw payload dumps, or internal errors. Phase 4 activation retains its existing audit event.

## Concurrency and disposable PostgreSQL evidence

The complete 19-migration chain and Phase 4 representative fixture were replayed on a fresh localhost-only PostgreSQL 16 container. The Phase 5 script verified:

- legacy mode before any ACTIVE release;
- unauthorized draft/rate mutation rejection;
- exact legacy-only draft creation and discard;
- live draft creation;
- active vehicle added after draft creation and explicit legacy fill;
- duplicate rate rejection;
- failed multi-row enable operation rolled back without a revision change;
- two concurrent edits with one winner and one stable stale-edit result;
- exact daily/weekly/monthly saves and supported rule updates;
- pricing validation without activation;
- live/draft Phase 3 quote comparison;
- exact draft attachment and full release validation;
- explicit activation through Phase 4;
- release-backed runtime result of 98,000 minor units for 10 days as one weekly plus three daily units;
- Booking and BookingPricingSnapshot atomic persistence with exact release/rate provenance;
- exactly one ACTIVE release;
- eleven Phase 5 pricing audit events;
- unchanged legacy `Car.price` of 10,000;
- unchanged historical compatibility snapshot.

Expected Prisma error logs were emitted for the intentionally rejected duplicate insert and losing serialization-conflict transaction. Both were asserted and left no partial state.

No production, staging, shared, repository-configured, or personal-data database was contacted. The disposable container was removed after verification.

## Visual verification

The local auth configuration was inspected by variable name only; no secret was printed. `NEXT_PUBLIC_APP_URL` identifies `http://localhost:3000`, so the app was run there against the disposable database. The protected Pricing route redirected correctly into the configured Google OAuth application, eliminating Phase 4's port-3001 callback mismatch.

Authenticated Pricing/Billing inspection could not proceed without entering a real Google identity, which would introduce personal data into the disposable database. No production-auth weakening, permanent development bypass, synthetic OAuth provider, or credential disclosure was added. Responsive shell/table boundaries, strategy copy, issue states, money presentation, comparisons, read-only presentation, and confirmation behavior remain covered through focused component/unit tests and the production build, but authenticated desktop/mobile screenshots remain blocked by that identity constraint.

## Validation results

| Command or check | Result |
|---|---|
| Fresh PostgreSQL 16 replay | Pass; all 19 migrations |
| Phase 5 pricing administration integration | Pass |
| `pnpm exec prisma validate` | Pass |
| `pnpm exec prisma generate` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test:run` | Pass; 19 files, 117 tests |
| Scoped ESLint on touched TypeScript/TSX | Pass; zero errors and warnings |
| `pnpm build` | Pass; 48 routes/pages |
| `git diff --check` | Pass |

The production build retains the known stale `baseline-browser-mapping` and inferred workspace-root warnings. No schema or migration file changed in Phase 5.

## Files and commits

Primary files are the two Pricing/Billing routes, `app/actions/pricing-configuration.ts`, Phase 5 components under `components/business-configuration/`, `lib/pricing-admin/`, the centralized database capability helper, Phase 4 health/repository/workflow integrations, the disposable integration script, focused pricing-admin tests, and this audit document.

Focused implementation commits:

1. `c3b7576` — pricing draft repositories, services, authorization, health, audit, and actions.
2. `11cdb2f` — fleet pricing admin experience, comparison, and quote preview.
3. `0e2f414` — Billing Rules experience and plain-language strategies.
4. `b30ae61` — unit/UI and disposable PostgreSQL integration verification.

## Known limitations and Phase 6 gate

- Calendar-month pricing remains intentionally unsupported.
- Customer-facing weekly/monthly selection controls are absent; runtime strategy chooses authoritative combinations.
- Currency conversion, arbitrary discounts, coupons, demand/location pricing, and new tax rules are absent.
- Authenticated desktop/mobile screenshots require a safe non-personal OAuth test identity or an approved test-auth facility; Phase 5 did not create one.
- A timezone change requires an attached draft release because timezone is an atomic-release compatibility key, not a PricingBilling payload column.

Phase 6 requires explicit approval and decisions for insurance product wording/price/tax/availability, minimum/maximum driver age, licence holding/country rules, required customer fields, and supported booking-step states. Phase 5 stops here and does not implement any of those forms or customer-flow changes.
