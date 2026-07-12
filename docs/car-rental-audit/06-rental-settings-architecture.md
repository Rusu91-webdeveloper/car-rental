# Business Configuration Architecture Proposal

Status: architecture approved; Phase 1, Phase 2A/2B, and the Phase 3 centralized pricing/runtime compatibility layer are complete as of 2026-07-12. Authorization cutover, configuration management, activation UI, and the Business Configuration dashboard remain unimplemented and require Phase 4 or later approval. This document supersedes the monolithic `RentalSettingsVersion` proposal.

Implementation evidence and the final authoritative persistence vocabulary are in `09-phase-2b-schema-and-migrations.md`. During the final enum gate, extensible `CustomerDocumentType` and `ConfirmationSectionType` vocabularies became seeded reference tables (`DocumentTypeDefinition` and `ConfirmationSectionDefinition`); all other approved closed lifecycle, technical, and supported business vocabularies remain enums. The final lifecycle names are `DRAFT/VALIDATED/RELEASED/ARCHIVED` for configuration versions and `DRAFT/VALIDATED/ACTIVE/SUPERSEDED/ARCHIVED` for release manifests, superseding illustrative `VALID`/`RETIRED` names below.

Phase 3 implementation evidence is in `10-phase-3-pricing-engine.md`. The runtime source resolver deliberately ignores inactive rate sets, uses legacy `Car.price` while no ACTIVE release exists, and fails closed if an ACTIVE release is invalid. Calendar-month arithmetic remains unsupported.

## 1. Evidence and constraints

The design is grounded in the current repository rather than a greenfield assumption:

- `prisma/schema.prisma` has mutable `Car.price`, a daily-only `Booking` snapshot, a broad `ADMIN` role, `AdminAuditLog`, and a mutable singleton `CompanySettings`. It has no configuration version, fleet-rate revision, customer/driver snapshot, insurance, legal publication/acceptance, capability, or customer-document model.
- `app/actions/bookings.ts` is correctly server-authoritative today, but it combines availability, `Car.price`, tax/deposit/guarantee rules, persistence, and post-commit email. New settings must not turn browser inputs into price authority.
- `lib/availability.ts` owns the current elapsed-time day calculation and application overlap checks. Billable-time policy and availability intervals must remain distinct concerns.
- `lib/auth.ts` re-queries the active user for sensitive work but authorizes with one `ADMIN` comparison. Capability checks can extend this fresh-database pattern.
- `app/[locale]/admin/admin-client.tsx` is a multi-domain client boundary. Graphify identifies `AdminDashboard()` as a hub and places booking, checkout, price calculation, and email data in the same community (`graphify-out/GRAPH_REPORT.md`, `docs/car-rental-audit/04-architecture-graph-summary.md`).
- `package.json` has a lint command but no ESLint dependency/configuration, test command, or type-check command.

No setting may weaken authorization, server pricing authority, private storage, scanning, audit logging, data integrity, historical evidence, transaction behavior, or secret handling.

## 2. Configuration-domain decision

### Chosen strategy

Use **independently versioned domains with an atomic release manifest**.

Domain teams can draft, validate, compare, and reuse a domain version independently. A domain version never becomes customer-effective on its own. `BusinessConfigurationRelease` is the only activation boundary and records the exact compatible set used for future quotes and bookings. This gives useful independent audit/rollback without allowing a payment, legal, document, or workflow change to go live in an incompatible combination.

Rejected alternatives:

- One atomic configuration version: simple activation, but recreates the oversized row/aggregate explicitly rejected by the product direction. Unrelated edits collide and every audit/rollback includes all concerns.
- Independently activated domains without a manifest: good editing isolation but unsafe. For example, mandatory payment could activate before a supported payment method, or required documents before the Documents step.

### Final domain boundaries

| Versioned domain | Contents | Why these settings change/validate together |
|---|---|---|
| General rental | Business timezone, currency, supported locales, pickup/return defaults and other non-secret general rental behavior | Cross-cutting defaults are small, low-churn, and referenced by several validators. Currency/timezone changes have broad impact and need an explicit release. |
| Pricing and billing | Weekly/monthly enablement, duration strategy, month definition, billable-day rule, grace/minimum rules, tax and adjustment policy | These inputs jointly determine chargeable units and money. Splitting “Pricing” and “Billing Rules” in navigation improves usability, but they share one activation/validation boundary. |
| Insurance | Enabled/name/description, optional or mandatory, daily price, tax treatment, fleet-wide or vehicle-specific availability, confirmation visibility | Insurance changes have distinct customer/legal/audit impact and rollback needs, while pricing consumes its immutable output. |
| Customer and driver requirements | Typed customer field states, age limits, licence-held period, licence dates, supported country restrictions | Driver rules force particular fields to be required; one domain prevents incompatible independently activated field and eligibility rules. The admin UI still provides separate Driver Requirements and Customer Information pages. |
| Booking workflow | Supported step states and review/confirmation behavior | Step compatibility is cohesive and depends on other domains at release validation. No arbitrary ordering or form builder. |
| Document policy | Accepted typed document categories, required/optional counts/sides, upload stage, bounded retention preference, allowed business capabilities | Requirements and retention/access policy need a distinct privacy/security audit and rollback trail. Code-owned storage and file-security limits are not configurable. |
| Payments | Implemented modes, default method, deposit type/value, balance rules, instructions, review/confirmation behavior | Payment combinations must activate together and cannot enable missing provider integrations. Credentials are excluded. |
| Confirmations | Allowlisted sections, typed text blocks, contact/pickup/return display, locale completeness | Content changes frequently and can be previewed/rolled back without changing legal publications. No executable templates or unsafe HTML. |
| Legal acceptance policy | Selected published terms/privacy documents by locale, required acceptance/acknowledgement behavior, evidence/snapshot rule | The policy changes with booking acceptance behavior. Legal text itself has a separate immutable publication lifecycle and is only referenced here. |

Fleet pricing is part of the pricing release but has high-cardinality records. An immutable `FleetRateSetVersion` and child `VehicleRateVersion` rows are referenced by the release alongside `PricingBillingConfigVersion`; this avoids packing every vehicle into a policy row and gives rate-source identifiers for booking snapshots.

### Lifecycle

Domain draft → Validate domain → Preview domain → Assemble release candidate → Validate full release → Preview before/after impact → Explicitly activate.

Activation runs in one serializable transaction, assigns a release number, makes the candidate active, retires the previous active release, and writes an audit event. Domain versions and rate sets referenced by an activated release become immutable. Rollback creates a new candidate referencing cloned or existing valid historical domain versions, then activates a new release; it never rewrites or silently reactivates history.

## 3. Proposed Prisma contracts

Names may be refined during the schema-diff review. Money uses integer minor units, percentages use basis points, timestamps are UTC, and calendar interpretation uses an IANA timezone.

Phase 2A completed that refinement. The exact target definitions, relation fields, indexes, constraints, database-specific SQL, migration stages, and compatibility plan are now authoritative in `08-phase-2-schema-proposal.md`. The excerpts in this section remain architectural illustrations; where a name or shape differs, document 08 supersedes the excerpt. The final proposal retains all nine approved boundaries but implements shared lifecycle metadata plus dedicated typed payload tables rather than duplicating lifecycle columns in every domain.

### Shared lifecycle and atomic release

```prisma
enum ConfigurationVersionStatus { DRAFT VALID RETIRED }
enum ReleaseStatus { DRAFT VALID ACTIVE RETIRED }

model BusinessConfigurationRelease {
  id                                  String @id @default(cuid())
  releaseNumber                       Int? @unique
  status                              ReleaseStatus @default(DRAFT)
  name                                String
  changeSummary                       String?
  generalConfigVersionId              String
  pricingBillingConfigVersionId       String
  fleetRateSetVersionId               String
  insuranceConfigVersionId            String
  customerDriverConfigVersionId       String
  bookingWorkflowConfigVersionId      String
  documentPolicyConfigVersionId       String
  paymentConfigVersionId              String
  confirmationConfigVersionId         String
  legalAcceptanceConfigVersionId      String
  createdById                         String
  validatedById                       String?
  activatedById                       String?
  createdAt                           DateTime @default(now())
  updatedAt                           DateTime @updatedAt
  validatedAt                         DateTime?
  activatedAt                         DateTime?
  retiredAt                           DateTime?

  @@index([status])
}
```

Every domain version repeats the lifecycle metadata `id`, `versionNumber`, `status`, `changeSummary`, `createdById`, `createdAt`, `updatedAt`, `validatedById`, and `validatedAt`. `versionNumber` is unique within its domain, not globally. A partial unique PostgreSQL index enforces at most one `ACTIVE` release. Database triggers or restricted update policies protect active/referenced versions from mutation.

### General, pricing, and immutable fleet rates

```prisma
model GeneralRentalConfigVersion {
  id                 String @id @default(cuid())
  versionNumber      Int @unique
  status             ConfigurationVersionStatus @default(DRAFT)
  businessTimeZone   String @default("Europe/Berlin")
  currency           String @default("EUR")
  supportedLocales   String[] @default(["de", "en"])
  // lifecycle metadata
}

model PricingBillingConfigVersion {
  id                       String @id @default(cuid())
  versionNumber            Int @unique
  status                   ConfigurationVersionStatus @default(DRAFT)
  weeklyPricingEnabled     Boolean @default(false)
  monthlyPricingEnabled    Boolean @default(false)
  mixedDurationStrategy    MixedDurationStrategy @default(DAILY_ONLY)
  rentalMonthDefinition    RentalMonthDefinition @default(FIXED_30_DAYS)
  billableDayRule          BillableDayRule @default(STARTED_24_HOUR_PERIODS)
  gracePeriodMinutes       Int @default(0)
  minimumRentalMinutes     Int @default(1)
  minimumChargeDays        Int @default(1)
  pricesIncludeTax         Boolean @default(false)
  taxRateBps               Int @default(0)
  // lifecycle metadata
}

model FleetRateSetVersion {
  id                  String @id @default(cuid())
  versionNumber       Int @unique
  status              ConfigurationVersionStatus @default(DRAFT)
  currency            String @default("EUR")
  rates               VehicleRateVersion[]
  // lifecycle metadata
}

model VehicleRateVersion {
  id                    String @id @default(cuid())
  fleetRateSetVersionId String
  carId                 String
  dailyRate             Int
  weeklyRate            Int?
  monthlyRate           Int?
  weeklyRateEnabled     Boolean @default(false)
  monthlyRateEnabled    Boolean @default(false)
  createdAt             DateTime @default(now())

  @@unique([fleetRateSetVersionId, carId])
  @@index([carId])
}

enum MixedDurationStrategy { DAILY_ONLY LONGEST_BLOCKS_THEN_DAYS LOWEST_VALID_TOTAL }
enum RentalMonthDefinition { FIXED_28_DAYS FIXED_30_DAYS CALENDAR_MONTH }
enum BillableDayRule { STARTED_24_HOUR_PERIODS CALENDAR_DAYS PICKUP_TIME_BOUNDARY }
```

`minimumRentalMinutes` represents eligibility; `minimumChargeDays` represents the price floor. Validation keeps them understandable in the UI. `Car.price` remains a temporary compatibility mirror only and is not the long-term rate source.

### Insurance, customer/driver, and booking workflow

```prisma
model InsuranceConfigVersion {
  id                    String @id @default(cuid())
  versionNumber         Int @unique
  status                ConfigurationVersionStatus @default(DRAFT)
  enabled               Boolean @default(false)
  customerFacingName    String
  shortDescription      String?
  selectionMode         InsuranceSelectionMode @default(OPTIONAL)
  pricePerDay           Int @default(0)
  taxTreatment          TaxTreatment @default(INHERIT_RENTAL)
  availabilityScope     InsuranceAvailabilityScope @default(ALL_VEHICLES)
  showInConfirmation    Boolean @default(true)
  vehicleAvailability   InsuranceVehicleAvailability[]
  // lifecycle metadata
}

model InsuranceVehicleAvailability {
  configVersionId String
  carId           String
  available       Boolean @default(true)
  @@id([configVersionId, carId])
}

model CustomerDriverConfigVersion {
  id                         String @id @default(cuid())
  versionNumber              Int @unique
  status                     ConfigurationVersionStatus @default(DRAFT)
  minimumDriverAge           Int @default(18)
  maximumDriverAge           Int?
  minimumLicenceHeldMonths   Int @default(0)
  allowedLicenceCountries    String[] @default([])
  fields                     CustomerFieldRequirement[]
  // lifecycle metadata
}

model CustomerFieldRequirement {
  configVersionId String
  field           CustomerField
  requirement     RequirementLevel
  @@id([configVersionId, field])
}

model BookingWorkflowConfigVersion {
  id             String @id @default(cuid())
  versionNumber  Int @unique
  status         ConfigurationVersionStatus @default(DRAFT)
  steps          BookingStepConfiguration[]
  // lifecycle metadata
}

model BookingStepConfiguration {
  configVersionId String
  step            BookingStep
  requirement     RequirementLevel
  displayOrder    Int
  @@id([configVersionId, step])
}

enum RequirementLevel { REQUIRED OPTIONAL HIDDEN }
enum CustomerField { FIRST_NAME LAST_NAME EMAIL PHONE DATE_OF_BIRTH COUNTRY ADDRESS CITY POSTAL_CODE NATIONALITY LICENCE_NUMBER LICENCE_ISSUE_DATE LICENCE_EXPIRY_DATE }
enum BookingStep { VEHICLE_AND_DATES CUSTOMER_INFORMATION DRIVER_INFORMATION INSURANCE DOCUMENTS LEGAL_ACCEPTANCE PAYMENT REVIEW CONFIRMATION }
enum InsuranceSelectionMode { OPTIONAL MANDATORY }
enum InsuranceAvailabilityScope { ALL_VEHICLES SELECTED_VEHICLES }
enum TaxTreatment { INHERIT_RENTAL TAX_INCLUDED TAX_EXCLUDED }
```

First name, last name, and email are code-required for booking identity/contact integrity and cannot be hidden. Confirmation is always required. Rules that need DOB or licence dates elevate those typed fields to required during validation.

### Documents, payments, and confirmations

```prisma
model DocumentPolicyConfigVersion {
  id                       String @id @default(cuid())
  versionNumber            Int @unique
  status                   ConfigurationVersionStatus @default(DRAFT)
  retentionPreferenceDays  Int
  requirements             DocumentRequirement[]
  rolePermissions          DocumentPolicyRolePermission[]
  // lifecycle metadata
}

model DocumentRequirement {
  configVersionId String
  documentType    CustomerDocumentType
  requirement     RequirementLevel
  fileCount       Int
  sides           DocumentSides
  uploadStage     DocumentUploadStage
  @@id([configVersionId, documentType])
}

model DocumentPolicyRolePermission {
  configVersionId String
  role            Role
  mayView         Boolean @default(false)
  mayDownload     Boolean @default(false)
  mayDelete       Boolean @default(false)
  @@id([configVersionId, role])
}

model PaymentConfigVersion {
  id                         String @id @default(cuid())
  versionNumber              Int @unique
  status                     ConfigurationVersionStatus @default(DRAFT)
  defaultMethod              ConfiguredPaymentMethod
  confirmationMode           PaymentConfirmationMode
  depositMode                DepositMode @default(NONE)
  depositValue               Int @default(0)
  remainingBalanceRule       RemainingBalanceRule
  methods                    PaymentMethodConfiguration[]
  instructions               PaymentInstructionTranslation[]
  // lifecycle metadata
}

model PaymentMethodConfiguration {
  configVersionId String
  method          ConfiguredPaymentMethod
  enabled         Boolean @default(false)
  @@id([configVersionId, method])
}

model PaymentInstructionTranslation {
  id              String @id @default(cuid())
  configVersionId String
  locale          String
  instructions    String @db.Text
  @@unique([configVersionId, locale])
}

model ConfirmationConfigVersion {
  id             String @id @default(cuid())
  versionNumber  Int @unique
  status         ConfigurationVersionStatus @default(DRAFT)
  sections       ConfirmationSectionConfiguration[]
  content        ConfirmationContentTranslation[]
  // lifecycle metadata
}

model ConfirmationSectionConfiguration {
  configVersionId String
  section         ConfirmationSection
  enabled         Boolean @default(true)
  @@id([configVersionId, section])
}

model ConfirmationContentTranslation {
  id              String @id @default(cuid())
  configVersionId String
  locale          String
  heading         String?
  safeContent     String? @db.Text
  @@unique([configVersionId, locale])
}

enum CustomerDocumentType { IDENTITY_CARD PASSPORT DRIVING_LICENCE }
enum DocumentSides { SINGLE_FILE FRONT_AND_BACK }
enum DocumentUploadStage { DURING_BOOKING AFTER_REQUEST BEFORE_PICKUP }
enum ConfiguredPaymentMethod { BOOKING_REQUEST CASH_ON_PICKUP CARD_ON_PICKUP BANK_TRANSFER ONLINE_DEPOSIT ONLINE_FULL }
enum DepositMode { NONE FIXED_AMOUNT PERCENTAGE_BPS }
enum PaymentConfirmationMode { IMMEDIATE REQUIRES_REVIEW }
enum ConfirmationSection { PRICING INSURANCE PAYMENT PICKUP_RETURN CUSTOMER_DETAILS DOCUMENT_REMINDERS LEGAL_REFERENCES COMPANY_CONTACT }
```

Additional document categories require a reviewed schema/enum extension; administrators cannot create arbitrary categories in the first release. A document policy can only further restrict access: the user must also hold the corresponding code-enforced capability. Payment activation filters against code-owned integration capabilities; settings cannot make online card modes real while the current Stripe route remains disabled.

Confirmation sections are an enum allowlist: pricing breakdown, insurance, payment instructions, pickup/return, customer details, document reminders, legal references, and company contact. Editable text is plain text or sanitized rich text with a strict allowlist; no executable template language, scripts, secrets, private document URLs, or arbitrary HTML.

### Legal publication and acceptance policy

```prisma
model LegalDocumentVersion {
  id             String @id @default(cuid())
  type           LegalDocumentType
  versionLabel   String
  status         LegalPublicationStatus @default(DRAFT)
  publishedById  String?
  publishedAt    DateTime?
  archivedAt     DateTime?
  translations   LegalDocumentTranslation[]
  @@unique([type, versionLabel])
}

model LegalDocumentTranslation {
  id                     String @id @default(cuid())
  legalDocumentVersionId String
  locale                 String
  title                  String
  content                String @db.Text
  contentHash            String
  @@unique([legalDocumentVersionId, locale])
}

model LegalAcceptanceConfigVersion {
  id                    String @id @default(cuid())
  versionNumber         Int @unique
  status                ConfigurationVersionStatus @default(DRAFT)
  termsDocumentId       String
  privacyDocumentId     String
  termsAcceptance       AcceptanceRequirement @default(REQUIRED)
  privacyAcknowledgment AcceptanceRequirement @default(REQUIRED)
  retainRenderedSnapshot Boolean @default(true)
  // lifecycle metadata
}

enum LegalDocumentType { RENTAL_TERMS PRIVACY_NOTICE }
enum LegalPublicationStatus { DRAFT PUBLISHED ARCHIVED }
enum AcceptanceRequirement { REQUIRED DISPLAY_ONLY }
```

Drafts are editable. Publication validates translations, computes hashes, and freezes the document and translations. Archived means unavailable for a future release, not deleted. The release validator requires published, type-correct, locale-complete documents.

### Capabilities and audit

```prisma
model Capability {
  id          String @id @default(cuid())
  key         String @unique
  description String
}

model RoleCapability {
  role         Role
  capabilityId String
  @@id([role, capabilityId])
}

model UserCapability {
  userId       String
  capabilityId String
  granted      Boolean
  @@id([userId, capabilityId])
}

model AuditEvent {
  id          String @id @default(cuid())
  actorUserId String?
  action      String
  targetType  String
  targetId    String
  before      Json?
  after       Json?
  metadata    Json?
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime @default(now())
  @@index([targetType, targetId])
  @@index([actorUserId, createdAt])
}
```

Keep `AdminAuditLog` readable during transition; add `AuditEvent` additively and migrate producers without rewriting history. Redaction is server-owned. Secrets, full identity content, access tokens, and raw payment credentials never enter audit JSON.

Proposed capability keys:

- `configuration.view`, `configuration.edit`, `configuration.validate`, `configuration.activate`
- `pricing.manage`
- `legal.edit`, `legal.publish`
- `documents.view`, `documents.download`, `documents.delete`
- `payments.manage`, `confirmations.manage`
- `roles.manage`, `security.audit.view`

`requireCapability()` re-queries active user, role mappings, and overrides on every server action/route/sensitive query. UI hiding is convenience only. Existing `ADMIN` users receive a compatibility role mapping in the additive migration; final least-privilege assignments require owner approval. Prevent self-escalation and loss of the last principal able to manage roles.

### Booking evidence and private document metadata

New booking relations/fields are nullable during transition:

- `configurationReleaseId`, `fleetRateSetVersionId`, `vehicleRateVersionId`, `pricingEngineVersion`, `snapshotSchemaVersion`.
- `pricingSnapshot Json`, containing rate values and source IDs, duration rule/units, daily/weekly/monthly quantities, discounts/adjustments, insurance, tax, subtotal, deposit/balance, total, currency, timezone, and engine version.
- `customerSnapshot Json` and `driverSnapshot Json`, validated by versioned code-owned schemas. Query-critical contact fields may live in a typed one-to-one `BookingCustomerSnapshot` instead of JSON after the schema-diff review.
- `insuranceSnapshot Json`, `paymentSnapshot Json`, and `confirmationSnapshot Json`.
- `BookingLegalAcceptance` rows with document type/version, locale, timestamp, status, content hash, customer/booking, and optional rendered/text snapshot.

Legacy bookings keep `pricePerDay`, `totalDays`, and `totalPrice`, receive `snapshotSchemaVersion = 0`, and are rendered by a compatibility reader. No consent, insurance, identity, or document facts are fabricated.

```prisma
model CustomerDocument {
  id               String @id @default(cuid())
  bookingId        String?
  customerUserId   String
  documentType     CustomerDocumentType
  side             DocumentSide
  storageKey       String @unique
  originalFileName String
  declaredMimeType String
  detectedMimeType String?
  detectedFileType String?
  sizeBytes        Int
  checksumSha256   String
  uploadStatus     DocumentUploadStatus @default(PENDING)
  scanStatus       MalwareScanStatus @default(PENDING)
  uploadedById     String
  retentionUntil   DateTime
  deletedAt        DateTime?
  deletionStatus   DocumentDeletionStatus @default(RETAINED)
  createdAt        DateTime @default(now())
  @@index([bookingId, documentType])
  @@index([retentionUntil, deletionStatus])
}
```

Only opaque private storage keys are stored. Signed access is short-lived and created after capability/ownership checks; every allowed or denied view/download/delete creates a redacted `AuditEvent`. Provider, region, encryption, safe MIME/signature allowlist, maximum size, malware scanning, URL lifetime ceiling, authorization, access logs, and hard retention bounds are System Settings/code/deployment invariants.

## 4. Server-side configuration health

`lib/business-configuration/health.ts` evaluates a release candidate or the live release and returns typed findings with severity, domain, plain-language message, remediation link, and blocking status. The admin client renders this result; it does not invent readiness.

Overall statuses:

- **Ready**: a valid active release exists and no blockers/warnings remain.
- **Action required**: at least one activation blocker exists.
- **Warning**: valid/active, but a non-blocking unusual or incomplete choice exists.
- **Draft changes**: a valid or invalid candidate differs from live.
- **Not configured**: no usable release/domain draft exists.

Checks include current live and candidate versions, missing domain drafts, vehicles without daily rates, missing enabled weekly/monthly rates, unpublished/wrong-type legal documents, incomplete translations, unsupported payment integrations/combinations, missing document rules, retention outside hard bounds, workflow dependencies, required typed fields, insurance inconsistencies, unsafe confirmation selections, locale/currency disagreement, and quote examples for 1/7/10/20/30/35 days. Overview lists live version IDs, drafts/authors/timestamps, validation result, activation date, and concise diffs.

## 5. Cross-domain release validation

Activation rejects, at minimum:

- no daily rate for any bookable vehicle; enabled weekly/monthly pricing without each applicable vehicle rate;
- invalid timezone/currency/locale or a domain currency mismatch;
- non-positive/overflowing money, tax outside 0–10,000 bps, grace/minimum bounds outside code limits, or impossible quote output;
- mandatory insurance while insurance is disabled, missing vehicle coverage, or invalid tax/price;
- hidden fields required by identity, age, licence, payment, legal, or document rules;
- hidden Terms/Privacy when the selected published policy requires acceptance; hidden Documents with required uploads; required Payment without an implemented method; hidden Confirmation;
- an unimplemented payment method, missing/default-disabled method, invalid fixed/percentage deposit, or incoherent balance/review behavior;
- unpublished, archived, wrong-type, or translation-incomplete legal versions;
- document retention outside hard legal/system bounds, unsupported categories/counts/stages, or grants to roles outside the privileged allowlist;
- confirmation fields or content outside the safe typed/sanitized allowlist.

Warnings, requiring explicit acknowledgement, include weekly rates not cheaper than seven daily units, monthly rates not cheaper than valid alternatives, large before/after quote changes, newly required customer data/documents, changed legal publications, and removal of a payment option. Existing bookings are unaffected.

## 6. Admin route and component structure

Business navigation is separate from sensitive infrastructure:

```text
/[locale]/admin/business-configuration
  /pricing
  /billing-rules
  /insurance
  /driver-requirements
  /customer-information
  /booking-flow
  /documents
  /payments
  /legal
  /confirmations
  /advanced

/[locale]/admin/system-settings
  infrastructure, credentials status (never secret values), security, roles,
  audit logs, storage/scanner/provider status, backups
```

The overview page is server-rendered from authorized release/health DTOs. Category pages share a `BusinessConfigurationShell`, `VersionStatusHeader`, `DraftActions`, `ValidationSummary`, `ImpactSummary`, `CustomerPreview`, and `ActivationDialog`. Pricing and Billing Rules are separate screens over one domain draft. Driver Requirements and Customer Information likewise edit one domain draft with cross-page validation.

Mutually exclusive strategies use radio cards with examples such as 10, 20, and 35 days. Toggles are limited to simple enabled/disabled choices. Complex controls show examples and safe ranges. Preview actions call the server pricing/eligibility/confirmation services. Activation requires a change summary, current authorization, an explicit “Activate for future bookings” confirmation, and a server-recomputed final validation/impact result.

Avoid internal terms in labels. For example, `MixedDurationStrategy` is presented as “How should longer rentals be priced?” with “Charge every day at the daily price,” “Use monthly, weekly and daily prices in order,” and “Automatically use the lowest valid price.”

## 7. Migration and recovery sequence

All migrations are additive until a separately approved cleanup. Before each migration: show the Prisma and SQL diff, explain compatibility/backfill/locks, explain forward recovery and rollback limits, run `prisma validate`, replay from zero on a disposable PostgreSQL database, and wait for approval when data risk is meaningful.

1. Add quality/test configuration only; capture baseline `typecheck`, build, and current lint failure.
2. Add capability, role mapping, generic audit event, domain version, release, and immutable fleet-rate tables. Do not activate them or alter reads.
3. Add nullable booking release/snapshot/evidence columns and legal publication/acceptance tables. Legacy reads remain unchanged.
4. Add private document metadata/status tables only; no production storage adapter or upload route yet.
5. Seed capabilities and compatibility mappings for active admins. Seed domain drafts, not a silently active release.
6. Create fleet-rate draft 1 from `Car.price`. Daily values are evidence-backed; weekly/monthly stay disabled/null. Preserve `Car.price`.
7. Import current static AGB/privacy translations as legal drafts. Legal owner reviews and publishes them; migration does not claim publication approval.
8. Create a compatibility release candidate matching current behavior: daily-only, started 24-hour periods, one-day minimum, current supported transfer/pay-at-pickup modes, and current tax/deposit values. The existing unexplained 10% fallback must be explicitly approved or removed from the candidate, not silently normalized.
9. Dual-read and compare server quotes; dual-write daily rate edits to `Car.price` and the current fleet-rate draft with discrepancy audit. Customer behavior remains on legacy pricing until verified.
10. Switch quote consumers, then booking creation, behind a code/deployment feature gate. New bookings get complete snapshots; settings changes never govern already-created bookings.
11. Add legal/customer/driver/insurance/workflow/payment/confirmation behavior in phase-gated migrations and releases.
12. Add document storage/scanning only after provider/region/security approval and an end-to-end threat review.
13. Add non-null constraints for new-booking records with staged `NOT VALID`/validation where appropriate; legacy rows remain identifiable and readable.
14. Only after telemetry, restore rehearsal, and an approved rollback window: remove compatibility reads/duplicate client math. Removing `Car.price` or old columns is a separate destructive-change approval.

Rollback before activation is dropping only newly added unused objects in a reviewed reversal. After new bookings reference the models, prefer forward-fix migrations; never drop evidence. Configuration rollback is a new release assembled from prior known-good versions. Backup/restore rehearsal and migration-lock timing are part of the production runbook.

## 8. Test infrastructure

- ESLint 9 flat config with `eslint` and the Next.js-compatible `eslint-config-next`; lint touched feature files and keep broad legacy cleanup separate.
- `tsc --noEmit` through `pnpm typecheck`.
- Vitest with deterministic timezone setup for pure unit tests and service contract tests.
- PostgreSQL integration tests against a dedicated disposable database, using Prisma migrations rather than `db push`; CI supplies the database service. No production database or reset.
- Playwright for critical localized admin-to-checkout flows after the UI exists.
- CI gates: frozen install, Prisma validation/generation, clean migration replay, lint, typecheck, unit, integration, build, and later E2E.

Required matrices include every case in the request: pricing boundaries/strategies/DST/snapshots; concurrent availability and rollback; insurance modes/tax; invalid/valid/unauthorized release lifecycle and rollback; legal publication/translation/acceptance immutability; document spoofing/size/auth/scan/retention/deletion/audit; typed customer/driver rules; supported payment/deposit modes; and confirmation snapshot consistency. Database-level tests exercise active-release uniqueness, referenced-version immutability, legal immutability, capability enforcement service boundaries, and overlap constraints.

## 9. File-by-file implementation map

### Existing files

| File | Planned change |
|---|---|
| `package.json`, `pnpm-lock.yaml` | Focused lint/typecheck/test/E2E scripts and approved dev dependencies. |
| `prisma/schema.prisma` | Add version domains, release/rate sets, legal/evidence, capabilities, audits, snapshots, documents, and outbox contracts. |
| `prisma/seed.ts`, `prisma/backup-data.ts` | Safe drafts/capabilities/rates and metadata backup; never document bytes, signed URLs, or fabricated evidence. |
| `lib/auth.ts` | Fresh database-backed `requireCapability()` and recent-auth support. |
| `lib/availability.ts` | Keep availability semantics separate; consume normalized instants from booking orchestration. |
| `lib/validations.ts` | Re-export domain schemas during extraction; booking input contains choices/data, never accepted totals. |
| `lib/config.ts` | Code/deployment integration flags and non-configurable security limits only. |
| `lib/email.tsx` | Render stored, safe confirmation snapshots through extracted templates. |
| `app/actions/bookings.ts` | Delegate to orchestrator; retain compatibility wrapper during migration. |
| `app/actions/cars.ts` | Create rate-set drafts/audits and temporary `Car.price` compatibility mirror. |
| `app/actions/settings.ts` | Keep company identity/display behavior; remove booking-policy ownership incrementally. |
| `app/[locale]/admin/page.tsx`, `admin-client.tsx` | Link to feature sections and extract domains without unrelated formatting cleanup. |
| Checkout, booking, legal pages | Consume public release DTOs/server quotes and render historical snapshots/legal publications. |
| `messages/de.json`, `messages/en.json` | Plain-language business configuration, validation, examples, and customer copy. |

### New modules and routes

| Path | Responsibility |
|---|---|
| `lib/business-configuration/{types,schema,repository,release-service,compatibility,health,diff}.ts` | Domain contracts, draft lifecycle, atomic activation, health, compatibility, and impact summaries. |
| `lib/pricing/{types,engine,quote-service,snapshot}.ts` | Pure integer-cent duration/rate/insurance/tax/deposit calculation and versioned snapshots. |
| `lib/eligibility/{schema,service}.ts` | Customer/driver requirement and age/licence validation. |
| `lib/legal/{schema,service,hash}.ts` | Draft/publication/translation resolution, hashes, and immutable acceptance targets. |
| `lib/documents/{policy,service,authorization,validation,retention}.ts` | Code-owned file policy, metadata state machine, access auditing, retention/deletion. |
| `lib/storage/private-object-store.ts`, `lib/storage/local-private-adapter.ts` | Provider abstraction and non-production local adapter; production adapter after approval. |
| `lib/booking/{orchestrator,snapshots,legacy-reader}.ts` | Transactional release resolution, recheck, persistence, and historical compatibility. |
| `lib/audit/service.ts`, `lib/outbox/service.ts` | Redacted append-only actions and transactional notification events. |
| `app/actions/business-configuration.ts`, `legal-documents.ts` | Capability-protected draft/validate/preview/activate/publish actions. |
| `app/api/booking-quotes/route.ts` | Server quote endpoint if Server Actions do not fit caching/interaction needs. |
| `app/api/documents/*` | Authorized upload/finalize/download/delete endpoints; added only with private storage. |
| `app/api/cron/{document-retention,outbox}/route.ts` | Authenticated idempotent workers. |
| `app/[locale]/admin/business-configuration/**` | Overview and category pages/components listed in section 6. |
| `app/[locale]/admin/system-settings/**` | Separate security/infrastructure/role/audit shell; secret values never returned. |
| `app/[locale]/admin/legal/**`, `admin/bookings/[id]/**` | Publication workspace and least-privilege booking/document views. |
| `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `tests/**` | Quality configuration and unit/integration/E2E suites. |

Exact migration filenames and a production storage adapter are intentionally deferred until approval.

## 10. Focused commit sequence

1. `test: add lint typecheck unit and integration foundations`
2. `feat: define business configuration contracts and capability keys`
3. `db: add versioned configuration release and audit models`
4. `db: add immutable fleet rates and nullable booking snapshot contracts`
5. `feat: add capability authorization and redacted audit service`
6. `feat: add domain draft validation health and atomic release service`
7. `feat: add deterministic pricing engine and quote previews`
8. `feat: add fleet rate drafts with daily price compatibility`
9. `feat: add business configuration overview and navigation shell`
10. `feat: add pricing billing and insurance configuration pages`
11. `feat: add customer driver and booking flow configuration`
12. `feat: add legal publication and acceptance evidence`
13. `feat: add document metadata and private storage foundation`
14. `feat: add audited document access scanning and retention`
15. `feat: add payment and confirmation configuration`
16. `feat: persist release-bound booking snapshots transactionally`
17. `feat: render snapshot-based booking details and outbox confirmations`
18. `test: harden concurrency migrations security and end-to-end flows`
19. `refactor: retire compatibility pricing after production verification`

Each commit must build, include scoped tests, preserve unrelated changes, and keep additive migration recovery notes. Generated Graphify output is not included unless separately approved.

## 11. Decisions that still require owner approval

These are genuine product/legal/security/infrastructure decisions and are not safe dashboard defaults:

1. Private object-storage provider and exact EU region; production encryption/key ownership and malware-scanning service.
2. Hard minimum/maximum retention bounds, retention start event, legal holds, erasure/export process, and who can approve deletion.
3. Initial roles/capability mappings, whether high-impact activation/legal publication needs two-person approval, and the recent-authentication policy.
4. Which payment modes are actually supported at launch. Current evidence supports bank transfer and pay at pickup; the Stripe webhook is intentionally unavailable.
5. Legal content owner/publisher, authoritative language, approved initial terms/privacy text, and whether version/hash plus snapshot meets evidence requirements.
6. Country restriction scope and approved data source if country-specific licence rules enter release one.
7. Whether `CALENDAR_MONTH` and `PICKUP_TIME_BOUNDARY` are release-one strategies or deferred until their product semantics are approved.
8. Whether customers may download their own identity documents; default proposal is no content download.
9. PostgreSQL production support/approval for a range exclusion constraint and any required extension, plus acceptable migration lock window.
10. CI disposable PostgreSQL and browser environment, production backup/restore owner, and notification outbox delivery mechanism.

Business-entered values—actual rates, age thresholds within bounds, selected fields, document requirements within hard limits, payment instructions, confirmation sections, and release change summaries—are administered through drafts and do not require developer hard-coding.

## 12. Approval checkpoint

Stop here. Approval of this plan authorizes the next planning-to-foundation phase only unless the owner explicitly authorizes schema changes/migrations. Before any migration, present the exact Prisma diff, generated SQL, legacy-record compatibility, lock/backfill impact, and forward recovery plan, run schema validation and clean replay, then wait at the migration approval gate.
