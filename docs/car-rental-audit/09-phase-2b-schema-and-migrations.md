# Phase 2B — Schema and Migration Evidence

Completion date: 2026-07-12. Scope: additive Prisma schema, six migration files, database constraints/triggers, compatibility data/backfill, schema verification, and operational documentation only. No production/shared database or runtime feature behavior was changed.

## Outcome

Phase 2B implements the approved hybrid persistence architecture:

- shared `ConfigurationVersion` lifecycle metadata;
- nine typed configuration payloads and their typed children;
- explicit atomic `BusinessConfigurationRelease` composition;
- separate immutable `FleetRateSet` and `VehicleRentalRate` records;
- separate legal version/translation publication lifecycle;
- optional Booking pricing, customer/driver, insurance, and legal-evidence children;
- provider-neutral private-document metadata only;
- AccessRole/Capability persistence while preserving legacy `User.role` and `requireAdmin()`;
- append-only `AuditEvent` persistence;
- database checks, partial active-release uniqueness, activation integrity, domain/payload integrity, and approved immutability triggers.

`Car.price`, all existing Booking/Payment scalar fields, current sessions/accounts, CompanySettings, availability logic, emails, routes, actions, and UI remain the active compatibility behavior. No Business Configuration release or legal publication is automatically created or activated.

## Final schema differences from Phase 2A

The final schema has 32 new PostgreSQL enums and 37 new models. Existing `User`, `Car`, and `Booking` receive relation fields only. Prisma formatting also realigned whitespace in the intentionally touched schema; it did not change existing field semantics.

Two Phase 2A enums were deliberately replaced with reference models after the required enum review:

| Phase 2A enum | Final representation | Reason |
|---|---|---|
| `CustomerDocumentType` | `DocumentTypeDefinition` with stable seeded keys | Approved document categories may expand independently. A reference row preserves typed relations without a PostgreSQL enum migration. |
| `ConfirmationSectionType` | `ConfirmationSectionDefinition` with stable seeded keys | Confirmation sections are allowlisted but expected to evolve. The reference table remains code-seeded and cannot become an arbitrary executable template. |

The Phase 1 contracts were aligned with persistence: customer fields now use `REQUIRED/OPTIONAL/DISABLED`, document requirements use `REQUIRED/OPTIONAL/DISABLED`, and `LICENCE_ISSUING_COUNTRY` is included. A unit test compares closed Prisma enums and seeded reference/capability keys to the Phase 1 constants so drift fails CI.

### Enum review classification

| Classification | Final PostgreSQL enums |
|---|---|
| Stable closed lifecycle/status | `ConfigurationVersionStatus`, `ConfigurationValidationStatus`, `BusinessConfigurationReleaseStatus`, `CustomerDocumentUploadStatus`, `MalwareScanStatus`, `DocumentDeletionStatus`, `LegalPublicationStatus`, `AccessRoleStatus` |
| Stable technical | `ConfigurationDomainType`, `BillableDayMethod`, `DocumentSides`, `DocumentSide`, `DocumentUploadStage`, `LegalAcceptanceSource`, `AuditCategory` |
| Code-supported business vocabulary | `MixedDurationPricingStrategy`, `RentalMonthDefinition`, `PriceTaxTreatment`, `InsuranceRequirementMode`, `InsuranceTaxTreatment`, `InsuranceAvailabilityScope`, `CustomerFieldType`, `CustomerFieldMode`, `BookingStepType`, `BookingStepMode`, `DocumentRequirementMode`, `ConfiguredPaymentMode`, `DepositType`, `PaymentConfirmationMode`, `RemainingBalanceRule`, `LegalDocumentType`, `LegalAcceptanceRequirement` |
| Extensible identifiers kept out of enums | capability keys, access-role keys, audit actions, storage/scanning provider IDs, regions, MIME/detected types, locales, currencies, engine versions, document-category keys, confirmation-section keys |

`ConfiguredPaymentMode` represents a closed business workflow, not a provider identifier. It does not enable Stripe or any other integration.

## Files changed

### Schema and migration artifacts

- `prisma/schema.prisma`
- `prisma/migrations/20260712213000_add_authorization_foundation/migration.sql`
- `prisma/migrations/20260712213100_add_legal_publication_foundation/migration.sql`
- `prisma/migrations/20260712213200_add_business_configuration_and_fleet_rates/migration.sql`
- `prisma/migrations/20260712213300_add_booking_snapshots_and_legal_evidence/migration.sql`
- `prisma/migrations/20260712213400_add_customer_document_metadata_and_audit/migration.sql`
- `prisma/migrations/20260712213500_add_compatibility_data_and_immutability/migration.sql`
- `prisma/MIGRATION_NOTES.md`
- `prisma/backup-data.ts`

### Verification and backfill

- `scripts/phase2b-representative-legacy-fixture.sql`
- `scripts/phase2b-compatibility-backfill.sql`
- `scripts/phase2b-schema-verification.sql`
- `scripts/phase2b-booking-overlap-preflight.sql`
- `tests/unit/business-configuration/persistence-vocabulary.test.ts`
- Phase 1 contract files under `lib/business-configuration/`

`prisma/seed.ts` was not changed: deterministic compatibility/reference data belongs to migration 6, and the fleet backfill is an explicit separate SQL script. No production seed was run.

## Generated SQL review

All structural migrations are additive. Searches found no `DROP TABLE`, `DROP COLUMN`, `DROP TYPE`, or alteration of current User/Car/Booking/Payment/CompanySettings/Account/Session/BlockedDate/AdminAuditLog columns in the six new files.

| Migration | Main contents | Lock/rewrite assessment |
|---|---|---|
| `...213000_add_authorization_foundation` | 32 enums; AccessRole, Capability, RoleCapability, UserAccessRole | New objects and brief User FK catalog locks; no table rewrite. |
| `...213100_add_legal_publication_foundation` | LegalDocumentVersion/Translation, indexes, actor FKs | New objects and brief User FK locks; no legal data inserted. |
| `...213200_add_business_configuration_and_fleet_rates` | Configuration lifecycle, two reference vocabularies, nine typed domains/children, explicit release, fleet rates | New objects/FKs only; `Car.price` untouched. |
| `...213300_add_booking_snapshots_and_legal_evidence` | Four optional Booking child/evidence tables | No Booking column or rewrite; FK validation takes brief locks. |
| `...213400_add_customer_document_metadata_and_audit` | CustomerDocument metadata and AuditEvent | New objects only; no storage URL/content/IP/user-agent columns. |
| `...213500_add_compatibility_data_and_immutability` | Stable vocabulary/capability data, ADMIN mappings, checks, partial active index, integrity and immutability triggers | Inserts into new tables and catalog locks for constraints/triggers; no runtime cutover. |

Every FK has explicit delete behavior. Historical/referenced evidence uses `Restrict`; auth/role join ownership uses reviewed cascades; AuditEvent actor uses `SetNull` while release/document references restrict deletion.

## Compatibility backfill

`scripts/phase2b-compatibility-backfill.sql` is idempotent and deliberately separate from activation:

- requires eligible non-deleted Cars and an existing active legacy ADMIN actor;
- uses fixed ID `fleet-rate-set-compat-v1` and version 1;
- creates a `DRAFT`, `NOT_VALIDATED`, non-activated set;
- copies each eligible `Car.price` exactly into `dailyRate`;
- leaves weekly/monthly values null and flags false;
- uses deterministic per-car rate IDs and compound conflict protection;
- verifies completeness/equality after every execution;
- creates no BusinessConfigurationRelease and changes no Car or Booking.

On an empty database with no Cars it safely reports that no compatibility set is required. Against representative legacy data it was run twice; one rate row remained, the daily value remained 12,345 minor units, and `Car.price` remained 12,345.

## Money boundary

All new amounts use signed 32-bit integer minor units, matching current Car/Booking/Payment/email behavior. Currency is uppercase ISO-4217-style `VARCHAR(3)` on new monetary roots. Percentage values use integer basis points. The pricing engine must later define checked arithmetic and rounding; JSON traces serialize integer units. Existing floats and lowercase Payment currencies are not converted in Phase 2B.

## Immutability and integrity enforcement

### Prisma schema

- non-null release FKs make incomplete release composition structurally impossible;
- compound keys prevent duplicate domain versions, rates, rules, translations, document slots, role mappings, and legal acceptance;
- unique Booking FKs enforce one pricing/customer/insurance snapshot;
- restrictive FKs preserve referenced history;
- optimistic `revision` fields support later compare-and-increment services.

### Database checks/indexes/triggers

- positive version/revision and safe numeric bounds;
- daily/weekly/monthly rate consistency;
- one partial unique `ACTIVE` release index;
- deferred domain/payload correspondence trigger;
- deferred active-release integrity requiring released domain versions/rates, successful validation metadata, and published type-correct legal documents;
- released configuration root and child payload immutability;
- released FleetRateSet/root-rate immutability;
- ACTIVE/SUPERSEDED/ARCHIVED release immutability, while approved lifecycle archival transitions remain possible;
- published legal root/translation immutability;
- append-only BookingPricingSnapshot, BookingCustomerDriverSnapshot, BookingInsuranceSnapshot, BookingLegalAcceptance, and AuditEvent.

Drafts remain editable. Transition into RELEASED/ACTIVE/PUBLISHED is allowed once. Trigger errors identify the protected table/record. Database-role permission restrictions and a privileged, ticketed repair role remain deployment controls; Prisma alone is not claimed as sufficient.

## Disposable validation environment

- Docker container: `car-rental-phase2b-postgres`
- Image/runtime: PostgreSQL 16 Alpine
- Binding: `127.0.0.1:55432` only
- Databases: `phase2b_base`, `phase2b_shadow`, `phase2b_replay`, `phase2b_verify`
- Authentication: local trust inside the disposable container
- Data: empty or synthetic `.invalid` fixtures only

No repository database connection string was used for migrations or SQL. No production, staging, shared, or personal-data database was contacted.

## Migration and verification results

The first disposable replay failed in migration 3 because generated indexes for later snapshot/document tables were initially grouped into the wrong stage. PostgreSQL rejected `BookingPricingSnapshot` before its table existed. The unapplied local migration split was corrected, the disposable database was dropped/recreated, and the entire chain replayed successfully. This was the planned migration-failure recovery rehearsal; no shared migration history existed.

Final results:

| Validation | Result |
|---|---|
| Full 18-migration replay from empty PostgreSQL | Pass |
| `prisma migrate status` | Pass; database up to date |
| Second `prisma migrate deploy` | Pass; no pending migrations |
| Migrations-to-schema diff | Pass; no difference detected |
| Representative legacy chain + fixture + six migrations | Pass |
| Compatibility backfill executed twice | Pass; idempotent |
| Nine typed drafts | Pass |
| Incomplete release | Rejected by non-null constraints |
| Second active release | Rejected by partial unique index |
| Duplicate domain version/rate/snapshot/legal acceptance/role capability | Rejected |
| Released config/FleetRateSet/rate mutation | Rejected |
| Active release mutation | Rejected |
| Published legal root/translation mutation | Rejected |
| Snapshot/legal acceptance update/delete | Rejected |
| Audit update/delete | Rejected |
| ADMIN compatibility mapping | Pass |
| Legacy Booking without snapshots | Pass |
| Car.price unchanged | Pass |
| Restrictive delete behavior | Pass |
| Overlap preflight on synthetic data | Pass; zero rows |
| `pnpm exec prisma format` | Pass |
| `pnpm exec prisma validate` | Pass |
| `pnpm exec prisma generate` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test:run` | Pass: 5 files, 48 tests |
| Scoped ESLint | Pass |
| `pnpm build` | Pass; 40 routes/pages |

Build warnings remain pre-existing: stale `baseline-browser-mapping` data and Next.js workspace-root inference caused by another lockfile under `/Users/emanuelrusu`. Repository-wide legacy lint findings remain outside this phase.

## Deferred booking-overlap constraint

It was not applied. `scripts/phase2b-booking-overlap-preflight.sql` contains the read-only half-open overlap query and the exact gated SQL:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_no_active_vehicle_overlap"
EXCLUDE USING gist (
  "carId" WITH =,
  tsrange("pickupDate", "dropoffDate", '[)') WITH &&
)
WHERE (status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS'));
```

It requires extension privileges, a clean preflight, and a maintenance window because PostgreSQL exclusion constraints cannot be added `NOT VALID`. It covers booking-versus-booking conflicts, not cross-table BlockedDate conflicts. Another approval gate is required.

## Forward recovery

- Before shared deployment, fix an unapplied new migration and replay from zero, as exercised here.
- After shared application, never edit applied migration files; create a forward correction.
- Do not drop evidence after releases/publications/snapshots/documents/audits exist.
- Application rollback can ignore additive tables while a forward schema fix is prepared.
- Configuration rollback creates a new release; legal correction creates a new publication.
- Exceptional historical repair requires restricted credentials, backup, approval, and an immutable audit record.

## Remaining Phase 3 blockers

- Explicit compatibility pricing semantics for the first engine version, including the current unexplained 10% tax fallback.
- Runtime decision to block `CALENDAR_MONTH`; the schema retains the value but Phase 3 validation must reject it for release one.
- Server-side rounding/overflow policy and currency normalization.
- Repository/service APIs for draft/release activation and trigger-aware transactions.
- Decision on when the inactive compatibility rate set becomes validated/released; Phase 2B does not activate it.
- Production deployment approval, backup/restore rehearsal, database-role permissions, and migration lock monitoring.

Storage region/provider, malware scanner, hard retention, customer document access, payment-provider, and legal-publication authority decisions remain blockers for their later runtime phases, not for this additive schema.

## Production deployment checklist

- [ ] Review and freeze all six migration checksums.
- [ ] Confirm a verified production backup and restore rehearsal.
- [ ] Rehearse against a disposable clone using the production PostgreSQL major version.
- [ ] Record pre/post counts for current User, Car, Booking, Payment, auth, availability, settings, and audit tables.
- [ ] Confirm at least one active ADMIN before scheduling the separate rate backfill.
- [ ] Validate CompanySettings currency before rate backfill.
- [ ] Apply migrations only under a separately approved production change window.
- [ ] Verify zero automatically active BusinessConfigurationRelease and zero fabricated legal/snapshot/document records.
- [ ] Run the compatibility backfill separately and verify exact Car.price equality, null weekly/monthly values, and idempotency.
- [ ] Configure restricted application DB permissions and the privileged repair runbook.
- [ ] Monitor locks, statement timeouts, migration status, and application health.
- [ ] Do not apply `btree_gist`/overlap DDL without its separate approval.
- [ ] Do not cut runtime authorization, pricing, booking, legal, document, payment, or UI behavior during schema deployment.

Phase 2B stops here. Phase 3 requires explicit approval.
