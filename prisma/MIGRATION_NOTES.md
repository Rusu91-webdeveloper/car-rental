## Migration History Notes

- `20260104182400_add_nextauth_tables` is intentionally a no-op legacy marker.
- The real NextAuth migration is `20260106004518_add_nextauth_tables`.
- Applied migration files must never be edited after deploy; only add forward migrations.

### Why this file exists

This project had drift caused by post-apply migration edits in the past. The fix is:

1. keep legacy entries as-is,
2. codify corrections in new forward migrations,
3. avoid modifying historical migrations.

## Phase 2B additive schema migrations (2026-07-12)

Six forward-only migrations add Business Configuration persistence without runtime cutover:

1. `20260712213000_add_authorization_foundation`
2. `20260712213100_add_legal_publication_foundation`
3. `20260712213200_add_business_configuration_and_fleet_rates`
4. `20260712213300_add_booking_snapshots_and_legal_evidence`
5. `20260712213400_add_customer_document_metadata_and_audit`
6. `20260712213500_add_compatibility_data_and_immutability`

They create new enums, tables, indexes, foreign keys, safe checks, reference data,
partial uniqueness, activation-integrity checks, and approved immutability triggers.
They do not drop or reinterpret existing fields. `Car.price`, legacy Booking/Payment
columns, `User.role`, and `requireAdmin()` remain the compatibility path.

The compatibility fleet-rate backfill is intentionally separate at
`scripts/phase2b-compatibility-backfill.sql`. It requires an existing active ADMIN
actor and eligible Cars, creates only the fixed inactive draft
`fleet-rate-set-compat-v1`, copies only `Car.price` to daily rates, and is idempotent.
It must not be treated as release activation.

### Immutability and recovery

Database triggers protect released configuration metadata/payloads, released fleet
rates, active/superseded releases, published legal content/translations, booking
snapshots/legal acceptance, and audit events. Draft transitions remain editable.
Production database-role restrictions are still a deployment responsibility.

If a migration fails, fix the cause in a new forward migration or, before deployment,
correct the unapplied new migration and replay the entire chain on a fresh disposable
database. Never edit a migration that has been applied to a shared environment. Once
historical evidence exists, recovery must preserve it and use forward fixes plus an
audited privileged repair path.

The proposed `btree_gist` booking-overlap exclusion constraint is not part of these
migrations. Its read-only preflight and exact gated SQL are documented in
`scripts/phase2b-booking-overlap-preflight.sql` and require separate approval.

## Phase 3 compatibility pricing snapshots (2026-07-12)

`20260712221500_enable_compatibility_pricing_snapshots` makes only the release
provenance fields on `BookingPricingSnapshot` nullable so a legacy `Car.price`
quote can be snapshotted while no `BusinessConfigurationRelease` is active. It
adds explicit compatibility/source/strategy metadata and a consistency CHECK:
compatibility snapshots must have no release foreign keys and must identify
`CAR_PRICE`; release-backed snapshots must contain the complete provenance set
and identify `FLEET_RATE_SET`.

The migration defensively backfills any pre-existing release-backed snapshot's
new source fields before setting them non-null. It does not create, validate, or
activate a configuration release, and it does not modify `Car.price` or existing
Booking scalar values. Full-chain replay and atomic booking/snapshot verification
use only the disposable scripts documented in `10-phase-3-pricing-engine.md`.
