# Phase 2A — Exact Prisma Schema and Migration Proposal

Status: approved Phase 2A review artifact. Phase 2B was implemented and verified on disposable PostgreSQL 16 on 2026-07-12; `09-phase-2b-schema-and-migrations.md` is authoritative for the final schema, migrations, SQL, enum gate, and validation results. Runtime application behavior remains unchanged.

Final-review deviation: the proposed `CustomerDocumentType` and `ConfirmationSectionType` enums were replaced by seeded `DocumentTypeDefinition` and `ConfirmationSectionDefinition` reference tables because both vocabularies are extensible. No other approved schema direction was materially changed.

## 1. Current schema evidence

The source of truth inspected for this proposal is `prisma/schema.prisma`, Prisma 5.22.0 in `package.json`, every SQL file under `prisma/migrations/`, and the current services in `app/actions/` and `lib/`.

| Area | Current fact and file-level evidence |
|---|---|
| Database and ORM | PostgreSQL datasource using `DATABASE_URL`; Prisma Client is exactly 5.22.0 and the CLI range is `^5.22.0` (`prisma/schema.prisma`, `package.json`, `prisma/migrations/migration_lock.toml`). |
| User/auth | `User` has CUID text ID, unique email, nullable provider ID/name/image/email verification, legacy `Role` enum (`USER`, `ADMIN`), active/deactivation state, timestamps, bookings/reviews/saved cars/audit relations, and Stripe customer ID. NextAuth `Account` and `Session` cascade on user deletion; `VerificationToken` has token and compound uniqueness (`prisma/schema.prisma`). `lib/auth.ts` re-queries active users and promotes configured emails to `ADMIN`; `requireAdmin()` compares the legacy enum. |
| Vehicle | The vehicle model is named `Car`. It has unique slug, localized text, category/status enums, one required `Int` `price` documented as daily cents, public image URLs, specs, rating counters, soft-delete fields, and indexes on category/status/deletion/year (`prisma/schema.prisma`, `app/actions/cars.ts`). |
| Booking | `Booking` requires user/car, UTC-intended `DateTime` pickup/drop-off, location, daily-rate/total-day/total/deposit integer snapshots, guarantee, statuses, legacy payment method, Stripe identifiers, locale, and lifecycle timestamps. Unique booking number, transfer code, Stripe IDs, and exact `(carId,pickupDate,dropoffDate)` tuple exist; there is no arbitrary overlap constraint (`prisma/schema.prisma`). `createBooking()` recalculates on the server, locks the `Car` row, rechecks availability, and inserts under serializable isolation (`app/actions/bookings.ts`). |
| Payments | `Payment` is one-to-many from Booking, stores `Int` amount, free-form currency defaulting to lowercase `usd`, `PaymentStatus`, Stripe IDs, JSON metadata, and timestamps. Current active booking methods are `TRANSFER` and `PAY_AT_PICKUP`; Stripe webhook returns 410 (`prisma/schema.prisma`, `app/api/webhooks/stripe/route.ts`). |
| Availability | `BlockedDate` stores car, start/end `DateTime`, optional reason, and creation time. Application overlap checks use half-open comparisons against active bookings and blocked dates. Manual reservations encode customer/price JSON into `reason` (`lib/availability.ts`, `app/actions/admin.ts`). |
| Admin/audit | Authorization is the legacy `Role` enum. `AdminAuditLog` records an admin FK, enum action, target strings, optional booking, JSON before/after, reason, optional IP/user agent, and creation time. `deleteAdminUser()` deletes audit rows owned by the deleted admin, so the current log is not append-only (`prisma/schema.prisma`, `app/actions/admin.ts`). |
| Time representation | Prisma `DateTime` produces PostgreSQL `TIMESTAMP(3)` in the migration history, not `TIMESTAMPTZ`. Most mutable models have `createdAt`/`updatedAt`; `BlockedDate` and audit log have creation only. Application comments describe booking dates as UTC, but the database type itself carries no timezone (`prisma/migrations/20251230082045_add_year_to_car/migration.sql`). |
| Money/percentages | Car, Booking, Payment, and guarantee amounts use 32-bit `Int` minor units. `CompanySettings.taxRate`, `depositPercentage`, and `guaranteePercentage` are floating-point fractions. Currency is a free-form `String` on CompanySettings and Payment; Booking has no currency. Emails format integer cents (`prisma/schema.prisma`, `lib/money.ts`, `lib/email.tsx`). |
| Delete behavior | Car is soft-deleted. Booking-to-user/car and Payment-to-booking use restrictive deletes by default. Auth Account/Session and Review relations cascade. Admin audit's optional booking uses `SetNull`. User deletion is an application workflow and is refused when bookings exist (`prisma/schema.prisma`, `app/actions/admin.ts`). |
| Naming | Models and fields use PascalCase/camelCase; IDs are CUID strings; enums use uppercase snake case; tables retain Prisma model names. Existing migrations use quoted identifiers and forward corrections rather than editing applied files. |

### Migration history

There are twelve applied SQL files from 2025-12-30 through 2026-02-14. The first migration creates the core schema with a legacy `clerkId`. A duplicate timestamped NextAuth migration is an intentional no-op; the 2026-01-06 migration performs the actual Clerk-to-NextAuth transition. Later migrations add user activity, booking payment method, temporarily recreate then remove provider-ID uniqueness, add reviews, guarantee fields, and booking locale. `prisma/MIGRATION_NOTES.md` explicitly requires forward-only corrections because historical files were edited in the past. A clean replay must therefore precede Phase 2B deployment.

## 2. Persistence decision

Use a **hybrid relational design**:

1. `ConfigurationVersion` owns lifecycle metadata shared by all domains.
2. Each version has exactly one dedicated typed one-to-one payload table for one of the nine approved domains.
3. `BusinessConfigurationRelease` has explicit non-null foreign keys to each typed payload table and to one immutable `FleetRateSet`.
4. JSON is limited to validation-result snapshots and structured calculation/audit traces. Core rules remain typed and indexable.

The nine approved boundaries remain those implemented in Phase 1: general rental; pricing and billing; insurance; customer and driver requirements; booking workflow; document policy; payments; confirmations; and legal acceptance. The Phase 2 request's illustrative list splits driver/customer and omits legal acceptance, but it explicitly defers to the approved architecture. Changing those boundaries would invalidate the Phase 1 contracts.

This hybrid avoids duplicated lifecycle columns across nine tables, avoids a monolithic JSON settings record, and lets release foreign keys prove that each slot references the correct payload type. PostgreSQL trigger/check SQL is still required to prove that a metadata row's `domain` matches its one payload, because Prisma cannot express cross-table assertions.

## 3. Exact proposed Prisma schema

The following blocks are the Phase 2B target. Existing fields remain unless shown under **MODIFIED MODEL**. Relation arrays do not change current runtime behavior.

### NEW ENUMS

```prisma
enum ConfigurationDomainType {
  GENERAL_RENTAL
  PRICING_BILLING
  INSURANCE
  CUSTOMER_DRIVER_REQUIREMENTS
  BOOKING_WORKFLOW
  DOCUMENT_POLICY
  PAYMENTS
  CONFIRMATIONS
  LEGAL_ACCEPTANCE
}

enum ConfigurationVersionStatus {
  DRAFT
  VALIDATED
  RELEASED
  ARCHIVED
}

enum ConfigurationValidationStatus {
  NOT_VALIDATED
  VALID
  WARNING
  BLOCKED
}

enum BusinessConfigurationReleaseStatus {
  DRAFT
  VALIDATED
  ACTIVE
  SUPERSEDED
  ARCHIVED
}

enum MixedDurationPricingStrategy {
  DAILY_ONLY
  LONGEST_BLOCKS_THEN_DAYS
  LOWEST_VALID_TOTAL
}

enum RentalMonthDefinition {
  FIXED_28_DAYS
  FIXED_30_DAYS
  CALENDAR_MONTH
}

enum BillableDayMethod {
  STARTED_24_HOUR_PERIODS
  CALENDAR_DAYS
  PICKUP_TIME_BOUNDARY
}

enum PriceTaxTreatment {
  TAX_INCLUDED
  TAX_EXCLUDED
}

enum InsuranceRequirementMode {
  DISABLED
  OPTIONAL
  MANDATORY
}

enum InsuranceTaxTreatment {
  INHERIT_RENTAL
  TAX_INCLUDED
  TAX_EXCLUDED
}

enum InsuranceAvailabilityScope {
  ALL_VEHICLES
  SELECTED_VEHICLES
}

enum CustomerFieldType {
  FIRST_NAME
  LAST_NAME
  EMAIL
  PHONE
  DATE_OF_BIRTH
  COUNTRY
  ADDRESS
  CITY
  POSTAL_CODE
  NATIONALITY
  LICENCE_NUMBER
  LICENCE_ISSUE_DATE
  LICENCE_EXPIRY_DATE
  LICENCE_ISSUING_COUNTRY
}

enum CustomerFieldMode {
  REQUIRED
  OPTIONAL
  DISABLED
}

enum BookingStepType {
  VEHICLE_AND_DATES
  CUSTOMER_INFORMATION
  DRIVER_INFORMATION
  INSURANCE
  DOCUMENTS
  LEGAL_ACCEPTANCE
  PAYMENT
  REVIEW
  CONFIRMATION
}

enum BookingStepMode {
  REQUIRED
  OPTIONAL
  HIDDEN
}

enum CustomerDocumentType {
  IDENTITY_CARD
  PASSPORT
  DRIVING_LICENCE
}

enum DocumentRequirementMode {
  REQUIRED
  OPTIONAL
  DISABLED
}

enum DocumentSides {
  SINGLE_FILE
  FRONT_AND_BACK
}

enum DocumentSide {
  SINGLE
  FRONT
  BACK
}

enum DocumentUploadStage {
  DURING_BOOKING
  AFTER_REQUEST
  BEFORE_PICKUP
}

enum CustomerDocumentUploadStatus {
  PENDING
  UPLOADING
  UPLOADED
  VERIFYING
  READY
  REJECTED
  FAILED
}

enum MalwareScanStatus {
  PENDING
  CLEAN
  INFECTED
  FAILED
  NOT_AVAILABLE
}

enum DocumentDeletionStatus {
  RETAINED
  SCHEDULED
  DELETED
  FAILED
}

enum ConfiguredPaymentMode {
  BOOKING_REQUEST
  CASH_ON_PICKUP
  CARD_ON_PICKUP
  BANK_TRANSFER
  ONLINE_DEPOSIT
  ONLINE_FULL
}

enum DepositType {
  NONE
  FIXED_AMOUNT
  PERCENTAGE_BPS
}

enum PaymentConfirmationMode {
  IMMEDIATE
  REQUIRES_REVIEW
}

enum RemainingBalanceRule {
  NOT_APPLICABLE
  ON_PICKUP
  BEFORE_PICKUP
}

enum ConfirmationSectionType {
  PRICING
  INSURANCE
  PAYMENT
  PICKUP_RETURN
  CUSTOMER_DETAILS
  DOCUMENT_REMINDERS
  LEGAL_REFERENCES
  COMPANY_CONTACT
}

enum LegalDocumentType {
  RENTAL_TERMS
  PRIVACY_NOTICE
}

enum LegalPublicationStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum LegalAcceptanceRequirement {
  REQUIRED
  DISPLAY_ONLY
}

enum LegalAcceptanceSource {
  CUSTOMER_CHECKBOX
  CUSTOMER_SUBMISSION
  STAFF_RECORDED
}

enum AccessRoleStatus {
  ACTIVE
  INACTIVE
}

enum AuditCategory {
  CONFIGURATION
  PRICING
  INSURANCE
  LEGAL
  DOCUMENT
  PAYMENT
  AUTHORIZATION
  BOOKING
  SYSTEM
}
```

`ConfiguredPaymentMode` does not replace the existing `BookingPaymentMethod`; it describes future policy options, while activation code restricts choices to implemented integrations. Capability keys and audit actions remain reference-table/string values rather than giant enums so new permissions/actions can be added without PostgreSQL enum migrations.

### MODIFIED MODEL: User

Keep every existing field and relation, including legacy `role Role`. Add only:

```prisma
model User {
  // existing fields and relations remain unchanged

  configurationVersionsCreated   ConfigurationVersion[] @relation("ConfigurationVersionCreatedBy")
  configurationVersionsUpdated   ConfigurationVersion[] @relation("ConfigurationVersionUpdatedBy")
  configurationVersionsValidated ConfigurationVersion[] @relation("ConfigurationVersionValidatedBy")
  configurationReleasesCreated   BusinessConfigurationRelease[] @relation("ConfigurationReleaseCreatedBy")
  configurationReleasesUpdated   BusinessConfigurationRelease[] @relation("ConfigurationReleaseUpdatedBy")
  configurationReleasesValidated BusinessConfigurationRelease[] @relation("ConfigurationReleaseValidatedBy")
  configurationReleasesActivated BusinessConfigurationRelease[] @relation("ConfigurationReleaseActivatedBy")
  fleetRateSetsCreated           FleetRateSet[] @relation("FleetRateSetCreatedBy")
  fleetRateSetsUpdated           FleetRateSet[] @relation("FleetRateSetUpdatedBy")
  fleetRateSetsValidated         FleetRateSet[] @relation("FleetRateSetValidatedBy")
  fleetRateSetsActivated         FleetRateSet[] @relation("FleetRateSetActivatedBy")
  legalDocumentsCreated          LegalDocumentVersion[] @relation("LegalDocumentCreatedBy")
  legalDocumentsUpdated          LegalDocumentVersion[] @relation("LegalDocumentUpdatedBy")
  legalDocumentsPublished        LegalDocumentVersion[] @relation("LegalDocumentPublishedBy")
  legalAcceptances               BookingLegalAcceptance[] @relation("LegalAcceptanceCustomer")
  ownedCustomerDocuments         CustomerDocument[] @relation("CustomerDocumentOwner")
  uploadedCustomerDocuments      CustomerDocument[] @relation("CustomerDocumentUploader")
  accessRoleAssignments          UserAccessRole[]
  auditEvents                    AuditEvent[] @relation("AuditEventActor")
}
```

### MODIFIED MODEL: Car

```prisma
model Car {
  // existing fields and relations remain unchanged
  rentalRates             VehicleRentalRate[]
  insuranceAvailability   InsuranceVehicleAvailability[]
}
```

`Car.price` remains required and unchanged throughout the first migrations.

### MODIFIED MODEL: Booking

```prisma
model Booking {
  // existing fields and relations remain unchanged
  pricingSnapshot        BookingPricingSnapshot?
  customerDriverSnapshot BookingCustomerDriverSnapshot?
  insuranceSnapshot      BookingInsuranceSnapshot?
  legalAcceptances       BookingLegalAcceptance[]
  customerDocuments      CustomerDocument[]
}
```

No new scalar on Booking is required: optional one-to-one/one-to-many child relations preserve all legacy inserts and reads.

### NEW MODEL: shared configuration lifecycle

```prisma
model ConfigurationVersion {
  id                 String @id @default(cuid())
  domain             ConfigurationDomainType
  versionNumber      Int
  status             ConfigurationVersionStatus @default(DRAFT)
  validationStatus   ConfigurationValidationStatus @default(NOT_VALIDATED)
  schemaVersion      Int @default(1)
  revision           Int @default(1)
  changeSummary      String @db.Text
  validationSnapshot Json?
  createdById        String
  updatedById        String
  validatedById      String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  validatedAt        DateTime?
  activatedAt        DateTime?
  archivedAt         DateTime?

  createdBy   User @relation("ConfigurationVersionCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy   User @relation("ConfigurationVersionUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)
  validatedBy User? @relation("ConfigurationVersionValidatedBy", fields: [validatedById], references: [id], onDelete: Restrict)

  generalRental              GeneralRentalConfigVersion?
  pricingBilling             PricingBillingConfigVersion?
  insurance                  InsuranceConfigVersion?
  customerDriverRequirements CustomerDriverConfigVersion?
  bookingWorkflow            BookingWorkflowConfigVersion?
  documentPolicy             DocumentPolicyConfigVersion?
  paymentRules               PaymentConfigVersion?
  confirmation               ConfirmationConfigVersion?
  legalAcceptance            LegalAcceptanceConfigVersion?

  @@unique([domain, versionNumber])
  @@index([domain, status])
  @@index([validationStatus])
  @@index([createdById, createdAt])
}
```

### NEW MODELS: nine typed domain payloads

```prisma
model GeneralRentalConfigVersion {
  configurationVersionId String @id
  businessTimeZone       String
  currency               String @db.VarChar(3)
  supportedLocales       String[]

  version  ConfigurationVersion @relation(fields: [configurationVersionId], references: [id], onDelete: Restrict)
  releases BusinessConfigurationRelease[]
}

model PricingBillingConfigVersion {
  configurationVersionId   String @id
  weeklyPricingEnabled     Boolean @default(false)
  monthlyPricingEnabled    Boolean @default(false)
  mixedDurationStrategy    MixedDurationPricingStrategy @default(DAILY_ONLY)
  rentalMonthDefinition    RentalMonthDefinition @default(FIXED_30_DAYS)
  billableDayMethod        BillableDayMethod @default(STARTED_24_HOUR_PERIODS)
  gracePeriodMinutes       Int @default(0)
  minimumRentalMinutes     Int @default(1)
  minimumChargeDays        Int @default(1)
  priceTaxTreatment        PriceTaxTreatment @default(TAX_EXCLUDED)
  taxRateBps               Int @default(0)

  version          ConfigurationVersion @relation(fields: [configurationVersionId], references: [id], onDelete: Restrict)
  releases         BusinessConfigurationRelease[]
  pricingSnapshots BookingPricingSnapshot[]
}

model InsuranceConfigVersion {
  configurationVersionId String @id
  requirementMode        InsuranceRequirementMode @default(DISABLED)
  pricePerDay             Int @default(0)
  taxTreatment           InsuranceTaxTreatment @default(INHERIT_RENTAL)
  availabilityScope      InsuranceAvailabilityScope @default(ALL_VEHICLES)
  showInConfirmation     Boolean @default(true)

  version             ConfigurationVersion @relation(fields: [configurationVersionId], references: [id], onDelete: Restrict)
  translations        InsuranceConfigTranslation[]
  vehicleAvailability InsuranceVehicleAvailability[]
  releases            BusinessConfigurationRelease[]
  bookingSnapshots    BookingInsuranceSnapshot[]
}

model InsuranceConfigTranslation {
  id                           String @id @default(cuid())
  insuranceConfigVersionId     String
  locale                       String @db.VarChar(10)
  customerFacingName           String
  shortDescription             String? @db.Text

  insuranceConfig InsuranceConfigVersion @relation(fields: [insuranceConfigVersionId], references: [configurationVersionId], onDelete: Cascade)

  @@unique([insuranceConfigVersionId, locale])
  @@index([locale])
}

model InsuranceVehicleAvailability {
  insuranceConfigVersionId String
  carId                    String
  available                Boolean @default(true)

  insuranceConfig InsuranceConfigVersion @relation(fields: [insuranceConfigVersionId], references: [configurationVersionId], onDelete: Cascade)
  car             Car @relation(fields: [carId], references: [id], onDelete: Restrict)

  @@id([insuranceConfigVersionId, carId])
  @@index([carId])
}

model CustomerDriverConfigVersion {
  configurationVersionId     String @id
  minimumDriverAge           Int @default(18)
  maximumDriverAge           Int?
  minimumLicenceHeldMonths   Int @default(0)
  licenceMustCoverRentalEnd  Boolean @default(true)
  allowedLicenceCountries    String[]

  version    ConfigurationVersion @relation(fields: [configurationVersionId], references: [id], onDelete: Restrict)
  fieldRules CustomerFieldRule[]
  releases   BusinessConfigurationRelease[]
}

model CustomerFieldRule {
  customerDriverConfigVersionId String
  field                         CustomerFieldType
  mode                          CustomerFieldMode

  customerDriverConfig CustomerDriverConfigVersion @relation(fields: [customerDriverConfigVersionId], references: [configurationVersionId], onDelete: Cascade)

  @@id([customerDriverConfigVersionId, field])
  @@index([field, mode])
}

model BookingWorkflowConfigVersion {
  configurationVersionId String @id

  version  ConfigurationVersion @relation(fields: [configurationVersionId], references: [id], onDelete: Restrict)
  stepRules BookingStepRule[]
  releases BusinessConfigurationRelease[]
}

model BookingStepRule {
  bookingWorkflowConfigVersionId String
  step                           BookingStepType
  mode                           BookingStepMode
  displayOrder                   Int

  bookingWorkflowConfig BookingWorkflowConfigVersion @relation(fields: [bookingWorkflowConfigVersionId], references: [configurationVersionId], onDelete: Cascade)

  @@id([bookingWorkflowConfigVersionId, step])
  @@unique([bookingWorkflowConfigVersionId, displayOrder])
  @@index([step, mode])
}

model DocumentPolicyConfigVersion {
  configurationVersionId  String @id
  retentionPreferenceDays Int

  version         ConfigurationVersion @relation(fields: [configurationVersionId], references: [id], onDelete: Restrict)
  requirements    DocumentRequirementRule[]
  rolePermissions DocumentPolicyRolePermission[]
  releases        BusinessConfigurationRelease[]
}

model DocumentRequirementRule {
  documentPolicyConfigVersionId String
  documentType                  CustomerDocumentType
  mode                          DocumentRequirementMode
  fileCount                     Int
  sides                         DocumentSides
  uploadStage                   DocumentUploadStage

  documentPolicyConfig DocumentPolicyConfigVersion @relation(fields: [documentPolicyConfigVersionId], references: [configurationVersionId], onDelete: Cascade)

  @@id([documentPolicyConfigVersionId, documentType])
  @@index([documentType, mode])
}

model DocumentPolicyRolePermission {
  documentPolicyConfigVersionId String
  accessRoleId                  String
  mayView                       Boolean @default(false)
  mayDownload                   Boolean @default(false)
  mayDelete                     Boolean @default(false)

  documentPolicyConfig DocumentPolicyConfigVersion @relation(fields: [documentPolicyConfigVersionId], references: [configurationVersionId], onDelete: Cascade)
  accessRole           AccessRole @relation(fields: [accessRoleId], references: [id], onDelete: Restrict)

  @@id([documentPolicyConfigVersionId, accessRoleId])
  @@index([accessRoleId])
}

model PaymentConfigVersion {
  configurationVersionId String @id
  defaultMethod           ConfiguredPaymentMode
  confirmationMode       PaymentConfirmationMode
  depositType             DepositType @default(NONE)
  depositValue            Int @default(0)
  remainingBalanceRule    RemainingBalanceRule @default(NOT_APPLICABLE)

  version      ConfigurationVersion @relation(fields: [configurationVersionId], references: [id], onDelete: Restrict)
  methods      PaymentMethodRule[]
  instructions PaymentInstructionTranslation[]
  releases     BusinessConfigurationRelease[]
}

model PaymentMethodRule {
  paymentConfigVersionId String
  method                 ConfiguredPaymentMode
  enabled                Boolean @default(false)

  paymentConfig PaymentConfigVersion @relation(fields: [paymentConfigVersionId], references: [configurationVersionId], onDelete: Cascade)

  @@id([paymentConfigVersionId, method])
  @@index([method, enabled])
}

model PaymentInstructionTranslation {
  id                     String @id @default(cuid())
  paymentConfigVersionId String
  locale                 String @db.VarChar(10)
  instructions           String @db.Text

  paymentConfig PaymentConfigVersion @relation(fields: [paymentConfigVersionId], references: [configurationVersionId], onDelete: Cascade)

  @@unique([paymentConfigVersionId, locale])
  @@index([locale])
}

model ConfirmationConfigVersion {
  configurationVersionId String @id

  version      ConfigurationVersion @relation(fields: [configurationVersionId], references: [id], onDelete: Restrict)
  sections     ConfirmationSectionRule[]
  translations ConfirmationContentTranslation[]
  releases     BusinessConfigurationRelease[]
}

model ConfirmationSectionRule {
  confirmationConfigVersionId String
  section                     ConfirmationSectionType
  enabled                     Boolean @default(true)

  confirmationConfig ConfirmationConfigVersion @relation(fields: [confirmationConfigVersionId], references: [configurationVersionId], onDelete: Cascade)

  @@id([confirmationConfigVersionId, section])
  @@index([section, enabled])
}

model ConfirmationContentTranslation {
  id                          String @id @default(cuid())
  confirmationConfigVersionId String
  locale                      String @db.VarChar(10)
  heading                     String?
  safeContent                 String? @db.Text

  confirmationConfig ConfirmationConfigVersion @relation(fields: [confirmationConfigVersionId], references: [configurationVersionId], onDelete: Cascade)

  @@unique([confirmationConfigVersionId, locale])
  @@index([locale])
}

model LegalAcceptanceConfigVersion {
  configurationVersionId String @id
  termsDocumentVersionId String
  privacyDocumentVersionId String
  termsAcceptance        LegalAcceptanceRequirement @default(REQUIRED)
  privacyAcknowledgment  LegalAcceptanceRequirement @default(REQUIRED)
  retainContentSnapshot  Boolean @default(true)

  version         ConfigurationVersion @relation(fields: [configurationVersionId], references: [id], onDelete: Restrict)
  termsDocument   LegalDocumentVersion @relation("TermsLegalDocument", fields: [termsDocumentVersionId], references: [id], onDelete: Restrict)
  privacyDocument LegalDocumentVersion @relation("PrivacyLegalDocument", fields: [privacyDocumentVersionId], references: [id], onDelete: Restrict)
  releases        BusinessConfigurationRelease[]

  @@index([termsDocumentVersionId])
  @@index([privacyDocumentVersionId])
}
```

### NEW MODEL: atomic release manifest

```prisma
model BusinessConfigurationRelease {
  id                              String @id @default(cuid())
  releaseNumber                   Int @unique
  status                          BusinessConfigurationReleaseStatus @default(DRAFT)
  validationStatus                ConfigurationValidationStatus @default(NOT_VALIDATED)
  revision                        Int @default(1)
  name                            String
  changeSummary                   String @db.Text
  validationSnapshot              Json?
  generalRentalConfigVersionId    String
  pricingBillingConfigVersionId   String
  fleetRateSetId                  String
  insuranceConfigVersionId        String
  customerDriverConfigVersionId   String
  bookingWorkflowConfigVersionId  String
  documentPolicyConfigVersionId   String
  paymentConfigVersionId          String
  confirmationConfigVersionId     String
  legalAcceptanceConfigVersionId  String
  supersedesReleaseId             String?
  createdById                     String
  updatedById                     String
  validatedById                   String?
  activatedById                   String?
  createdAt                       DateTime @default(now())
  updatedAt                       DateTime @updatedAt
  validatedAt                     DateTime?
  activatedAt                     DateTime?
  archivedAt                      DateTime?

  generalRentalConfig   GeneralRentalConfigVersion @relation(fields: [generalRentalConfigVersionId], references: [configurationVersionId], onDelete: Restrict)
  pricingBillingConfig  PricingBillingConfigVersion @relation(fields: [pricingBillingConfigVersionId], references: [configurationVersionId], onDelete: Restrict)
  fleetRateSet          FleetRateSet @relation(fields: [fleetRateSetId], references: [id], onDelete: Restrict)
  insuranceConfig       InsuranceConfigVersion @relation(fields: [insuranceConfigVersionId], references: [configurationVersionId], onDelete: Restrict)
  customerDriverConfig  CustomerDriverConfigVersion @relation(fields: [customerDriverConfigVersionId], references: [configurationVersionId], onDelete: Restrict)
  bookingWorkflowConfig BookingWorkflowConfigVersion @relation(fields: [bookingWorkflowConfigVersionId], references: [configurationVersionId], onDelete: Restrict)
  documentPolicyConfig  DocumentPolicyConfigVersion @relation(fields: [documentPolicyConfigVersionId], references: [configurationVersionId], onDelete: Restrict)
  paymentConfig         PaymentConfigVersion @relation(fields: [paymentConfigVersionId], references: [configurationVersionId], onDelete: Restrict)
  confirmationConfig    ConfirmationConfigVersion @relation(fields: [confirmationConfigVersionId], references: [configurationVersionId], onDelete: Restrict)
  legalAcceptanceConfig LegalAcceptanceConfigVersion @relation(fields: [legalAcceptanceConfigVersionId], references: [configurationVersionId], onDelete: Restrict)
  supersedesRelease     BusinessConfigurationRelease? @relation("ReleaseSupersession", fields: [supersedesReleaseId], references: [id], onDelete: Restrict)
  supersedingReleases   BusinessConfigurationRelease[] @relation("ReleaseSupersession")
  createdBy             User @relation("ConfigurationReleaseCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy             User @relation("ConfigurationReleaseUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)
  validatedBy           User? @relation("ConfigurationReleaseValidatedBy", fields: [validatedById], references: [id], onDelete: Restrict)
  activatedBy           User? @relation("ConfigurationReleaseActivatedBy", fields: [activatedById], references: [id], onDelete: Restrict)

  pricingSnapshots BookingPricingSnapshot[]
  auditEvents      AuditEvent[]

  @@index([status])
  @@index([validationStatus])
  @@index([activatedAt])
  @@index([supersedesReleaseId])
}
```

Explicit columns are chosen instead of a release-item join. They prevent missing/duplicate domain slots, give Prisma direct includes, and create a compile-time migration failure when a required domain is added. A join table would be more extensible but would require triggers to prove exactly one item of every type and would permit ambiguous composition during ordinary writes.

### NEW MODELS: immutable fleet rates

```prisma
model FleetRateSet {
  id                 String @id @default(cuid())
  versionNumber      Int @unique
  status             ConfigurationVersionStatus @default(DRAFT)
  validationStatus   ConfigurationValidationStatus @default(NOT_VALIDATED)
  schemaVersion      Int @default(1)
  revision           Int @default(1)
  currency           String @db.VarChar(3)
  changeSummary      String @db.Text
  validationSnapshot Json?
  createdById        String
  updatedById        String
  validatedById      String?
  activatedById      String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  validatedAt        DateTime?
  activatedAt        DateTime?
  archivedAt         DateTime?

  createdBy   User @relation("FleetRateSetCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy   User @relation("FleetRateSetUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)
  validatedBy User? @relation("FleetRateSetValidatedBy", fields: [validatedById], references: [id], onDelete: Restrict)
  activatedBy User? @relation("FleetRateSetActivatedBy", fields: [activatedById], references: [id], onDelete: Restrict)

  rates            VehicleRentalRate[]
  releases         BusinessConfigurationRelease[]
  pricingSnapshots BookingPricingSnapshot[]

  @@index([status, validationStatus])
  @@index([createdById, createdAt])
}

model VehicleRentalRate {
  id                 String @id @default(cuid())
  fleetRateSetId     String
  carId              String
  dailyRate          Int
  weeklyRate         Int?
  monthlyRate        Int?
  weeklyRateEnabled  Boolean @default(false)
  monthlyRateEnabled Boolean @default(false)
  createdAt          DateTime @default(now())

  fleetRateSet FleetRateSet @relation(fields: [fleetRateSetId], references: [id], onDelete: Cascade)
  car          Car @relation(fields: [carId], references: [id], onDelete: Restrict)

  pricingSnapshots BookingPricingSnapshot[]

  @@unique([fleetRateSetId, carId])
  @@index([carId])
}
```

Rates remain a separately versioned set referenced beside pricing policy. They change at fleet cardinality, while billable-time/tax strategy changes as one policy. A release binds both. Soft-deleted cars may remain in historical sets; activation completeness checks only currently bookable, non-deleted cars. Missing positive daily rates or missing enabled weekly/monthly rates block release activation. `Car.price` backfills the first draft's `dailyRate` and remains the live compatibility source until a later application cutover.

### NEW MODELS: legal publication lifecycle

```prisma
model LegalDocumentVersion {
  id               String @id @default(cuid())
  type             LegalDocumentType
  versionNumber    Int
  status           LegalPublicationStatus @default(DRAFT)
  schemaVersion    Int @default(1)
  revision         Int @default(1)
  versionLabel     String
  changeSummary    String @db.Text
  manifestHash     String? @db.Char(64)
  createdById      String
  updatedById      String
  publishedById    String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  publishedAt      DateTime?
  archivedAt       DateTime?

  createdBy   User @relation("LegalDocumentCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy   User @relation("LegalDocumentUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)
  publishedBy User? @relation("LegalDocumentPublishedBy", fields: [publishedById], references: [id], onDelete: Restrict)

  translations       LegalDocumentTranslation[]
  termsPolicies      LegalAcceptanceConfigVersion[] @relation("TermsLegalDocument")
  privacyPolicies    LegalAcceptanceConfigVersion[] @relation("PrivacyLegalDocument")

  @@unique([type, versionNumber])
  @@unique([type, versionLabel])
  @@index([type, status])
  @@index([publishedAt])
}

model LegalDocumentTranslation {
  id                     String @id @default(cuid())
  legalDocumentVersionId String
  locale                 String @db.VarChar(10)
  title                  String
  canonicalContent       String @db.Text
  sanitizedHtml          String? @db.Text
  contentHash            String @db.Char(64)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  legalDocumentVersion LegalDocumentVersion @relation(fields: [legalDocumentVersionId], references: [id], onDelete: Cascade)
  acceptances          BookingLegalAcceptance[]

  @@unique([legalDocumentVersionId, locale])
  @@index([locale])
  @@index([contentHash])
}
```

There is no independent “active legal document” row. Publication freezes content; the legal-acceptance domain selects one published terms version and one published privacy version, and the atomic Business Configuration release activates that selection. This makes translation completeness a release compatibility check and prevents per-language active pointers from drifting.

### NEW MODELS: immutable booking snapshots

```prisma
model BookingPricingSnapshot {
  id                        String @id @default(cuid())
  bookingId                 String @unique
  configurationReleaseId    String
  pricingConfigVersionId    String
  fleetRateSetId            String
  vehicleRentalRateId       String
  snapshotSchemaVersion     Int @default(1)
  releaseNumber             Int
  pricingVersionNumber      Int
  fleetRateSetVersionNumber Int
  pricingEngineVersion      String
  currency                  String @db.VarChar(3)
  chargeableDurationMinutes Int
  chargeableDays            Int
  billableDayMethod         BillableDayMethod
  rentalMonthDefinition     RentalMonthDefinition
  dailyUnits                Int @default(0)
  weeklyUnits               Int @default(0)
  monthlyUnits              Int @default(0)
  sourceDailyRate           Int
  sourceWeeklyRate          Int?
  sourceMonthlyRate         Int?
  baseSubtotal              Int
  insuranceSubtotal         Int @default(0)
  adjustmentTotal           Int @default(0)
  taxTotal                  Int @default(0)
  grandTotal                Int
  calculatedAt              DateTime
  calculationTrace          Json?
  createdAt                 DateTime @default(now())

  booking              Booking @relation(fields: [bookingId], references: [id], onDelete: Restrict)
  configurationRelease BusinessConfigurationRelease @relation(fields: [configurationReleaseId], references: [id], onDelete: Restrict)
  pricingConfig        PricingBillingConfigVersion @relation(fields: [pricingConfigVersionId], references: [configurationVersionId], onDelete: Restrict)
  fleetRateSet         FleetRateSet @relation(fields: [fleetRateSetId], references: [id], onDelete: Restrict)
  vehicleRentalRate    VehicleRentalRate @relation(fields: [vehicleRentalRateId], references: [id], onDelete: Restrict)

  @@index([configurationReleaseId])
  @@index([pricingConfigVersionId])
  @@index([fleetRateSetId])
  @@index([vehicleRentalRateId])
  @@index([calculatedAt])
}

model BookingCustomerDriverSnapshot {
  id                       String @id @default(cuid())
  bookingId                String @unique
  snapshotSchemaVersion    Int @default(1)
  firstName                String
  lastName                 String
  email                    String
  phone                    String?
  dateOfBirth              DateTime? @db.Date
  country                  String? @db.VarChar(2)
  address                  String?
  city                     String?
  postalCode               String?
  nationality              String? @db.VarChar(2)
  licenceNumber            String?
  licenceIssueDate         DateTime? @db.Date
  licenceExpiryDate        DateTime? @db.Date
  licenceIssuingCountry    String? @db.VarChar(2)
  licenceHeldSinceDate     DateTime? @db.Date
  capturedAt               DateTime
  createdAt                DateTime @default(now())

  booking Booking @relation(fields: [bookingId], references: [id], onDelete: Restrict)
}

model BookingInsuranceSnapshot {
  id                       String @id @default(cuid())
  bookingId                String @unique
  insuranceConfigVersionId String
  snapshotSchemaVersion    Int @default(1)
  selected                 Boolean
  requirementMode          InsuranceRequirementMode
  customerFacingName       String
  description              String? @db.Text
  unitPrice                Int
  billableDays             Int
  subtotal                 Int
  taxTreatment             InsuranceTaxTreatment
  capturedAt               DateTime
  createdAt                DateTime @default(now())

  booking         Booking @relation(fields: [bookingId], references: [id], onDelete: Restrict)
  insuranceConfig InsuranceConfigVersion @relation(fields: [insuranceConfigVersionId], references: [configurationVersionId], onDelete: Restrict)

  @@index([insuranceConfigVersionId])
}
```

One-to-one normalized records are preferred over Booking columns or one-to-many calculations. They keep legacy Booking stable, guarantee at most one accepted calculation/party/insurance snapshot, and remain queryable without making the core Booking row extremely wide. The combined customer/driver snapshot is deliberate for release one: the authenticated renter is the primary driver, so separate models would duplicate identity/contact fields. Additional drivers would require a later normalized `BookingDriverSnapshot` collection rather than overloading this record.

First name, last name, and email are non-null only when a snapshot exists; the relation itself is optional, so historical bookings remain valid. Other fields remain nullable because domain rules, data minimization, and legacy evidence differ.

### NEW MODEL: booking legal acceptance

```prisma
model BookingLegalAcceptance {
  id                              String @id @default(cuid())
  bookingId                       String
  legalDocumentTranslationId      String
  customerUserId                  String?
  documentType                    LegalDocumentType
  documentVersionNumber           Int
  locale                          String @db.VarChar(10)
  contentHash                     String @db.Char(64)
  accepted                        Boolean
  acceptedAt                      DateTime
  source                          LegalAcceptanceSource
  contentSnapshot                 String? @db.Text
  createdAt                       DateTime @default(now())

  booking                  Booking @relation(fields: [bookingId], references: [id], onDelete: Restrict)
  legalDocumentTranslation LegalDocumentTranslation @relation(fields: [legalDocumentTranslationId], references: [id], onDelete: Restrict)
  customer                 User? @relation("LegalAcceptanceCustomer", fields: [customerUserId], references: [id], onDelete: Restrict)

  @@unique([bookingId, documentType])
  @@index([legalDocumentTranslationId])
  @@index([customerUserId, acceptedAt])
  @@index([documentType, acceptedAt])
}
```

The exact translated publication is referenced and its version/type/locale/hash are copied as evidence. No raw IP or user-agent is proposed: authenticated customer ID, booking, server timestamp, submission source, and immutable content hash are proportionate for the current requirement. If counsel requires network evidence, that is an explicit later privacy decision.

### NEW MODEL: private document metadata

```prisma
model CustomerDocument {
  id                    String @id @default(cuid())
  bookingId             String?
  customerUserId        String
  uploadedById          String
  documentType          CustomerDocumentType
  side                  DocumentSide @default(SINGLE)
  sequence              Int @default(1)
  storageProviderId     String
  storageRegion         String
  storageKey            String
  originalFileName      String?
  normalizedMimeType    String @db.VarChar(127)
  detectedMimeType      String? @db.VarChar(127)
  fileExtension         String? @db.VarChar(16)
  sizeBytes             Int
  checksumSha256        String @db.Char(64)
  uploadStatus          CustomerDocumentUploadStatus @default(PENDING)
  scanStatus            MalwareScanStatus @default(PENDING)
  scanProviderReference String?
  retentionUntil        DateTime
  legalHold             Boolean @default(false)
  deletionStatus        DocumentDeletionStatus @default(RETAINED)
  deletedAt             DateTime?
  deletionReason        String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  booking    Booking? @relation(fields: [bookingId], references: [id], onDelete: Restrict)
  customer   User @relation("CustomerDocumentOwner", fields: [customerUserId], references: [id], onDelete: Restrict)
  uploadedBy User @relation("CustomerDocumentUploader", fields: [uploadedById], references: [id], onDelete: Restrict)
  auditEvents AuditEvent[]

  @@unique([storageProviderId, storageKey])
  @@unique([bookingId, documentType, side, sequence])
  @@index([bookingId, documentType])
  @@index([customerUserId, documentType])
  @@index([retentionUntil, legalHold, deletionStatus])
  @@index([scanStatus, uploadStatus])
  @@index([deletionStatus, deletedAt])
  @@index([documentType])
}
```

This stores metadata only. `storageKey` is opaque and provider-scoped; no public or signed URL, file bytes, base64, secrets, or arbitrary filesystem path is persisted. `sequence` plus side supports multiple files and front/back requirements. PostgreSQL permits multiple null `bookingId` values under the compound unique constraint, which is intentional for quarantined pre-booking uploads; binding service validation must prevent two documents from taking the same slot.

Original filename is nullable and retained only for authorized operational display; it must be normalized for display and never used as a storage path. Storage provider and region are evidence snapshots, not credentials.

### NEW MODELS: capability persistence

```prisma
model AccessRole {
  id          String @id @default(cuid())
  key         String @unique
  name        String
  description String?
  status      AccessRoleStatus @default(ACTIVE)
  isSystem    Boolean @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  capabilities              RoleCapability[]
  userAssignments           UserAccessRole[]
  documentPolicyPermissions DocumentPolicyRolePermission[]

  @@index([status])
}

model Capability {
  id          String @id @default(cuid())
  key         String @unique
  description String
  createdAt   DateTime @default(now())

  roles RoleCapability[]
}

model RoleCapability {
  accessRoleId String
  capabilityId String
  createdAt    DateTime @default(now())

  accessRole AccessRole @relation(fields: [accessRoleId], references: [id], onDelete: Cascade)
  capability Capability @relation(fields: [capabilityId], references: [id], onDelete: Cascade)

  @@id([accessRoleId, capabilityId])
  @@index([capabilityId])
}

model UserAccessRole {
  userId       String
  accessRoleId String
  assignedAt   DateTime @default(now())

  user       User @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessRole AccessRole @relation(fields: [accessRoleId], references: [id], onDelete: Restrict)

  @@id([userId, accessRoleId])
  @@index([accessRoleId])
}
```

`AccessRole` avoids a name collision with the existing Prisma `Role` enum. The enum and `User.role` remain unchanged through compatibility rollout. Phase 2B creates tables and seeds capability keys, an `ADMIN_COMPAT` role, mappings for every active legacy admin, and no runtime switch. Direct user capability overrides are not justified: they complicate least-privilege review and can be added later only with a concrete exception workflow.

### NEW MODEL: append-only audit events

```prisma
model AuditEvent {
  id                     String @id @default(cuid())
  actorUserId            String?
  category               AuditCategory
  action                 String
  targetType             String
  targetId               String
  configurationReleaseId String?
  customerDocumentId     String?
  correlationId          String?
  beforeSummary          Json?
  afterSummary           Json?
  metadata               Json?
  ipHash                 String? @db.Char(64)
  createdAt              DateTime @default(now())

  actor               User? @relation("AuditEventActor", fields: [actorUserId], references: [id], onDelete: SetNull)
  configurationRelease BusinessConfigurationRelease? @relation(fields: [configurationReleaseId], references: [id], onDelete: Restrict)
  customerDocument     CustomerDocument? @relation(fields: [customerDocumentId], references: [id], onDelete: Restrict)

  @@index([actorUserId, createdAt])
  @@index([category, action, createdAt])
  @@index([targetType, targetId, createdAt])
  @@index([configurationReleaseId, createdAt])
  @@index([customerDocumentId, createdAt])
  @@index([correlationId])
  @@index([createdAt])
}
```

`action` remains a namespaced string such as `configuration.release.activated` or `document.download.denied`; an enum would require database migration for every new auditable action. `category` is a small stable enum useful for filtering. Raw IP and user agent are omitted. An optional keyed hash can support limited abuse correlation if a documented purpose and rotation/retention policy are approved. Before/after JSON must contain allowlisted summaries, never secrets, document content, full identifiers, payment credentials, or storage access URLs.

## 4. Model-by-model persistence rationale

| Model group | Strategy and reason |
|---|---|
| `ConfigurationVersion` | Typed lifecycle metadata plus JSON validation snapshot. Status/version/actors/times are queried and indexed; validation findings are versioned extensible output and do not drive booking logic directly. |
| General rental | Dedicated typed row: timezone/currency/locales are cross-domain compatibility keys and must be directly queryable. |
| Pricing/billing | Dedicated typed row: every field participates in price computation, bounds, and snapshot provenance. JSON would weaken money and strategy integrity. |
| Fleet rates | Separate typed immutable set/children: high cardinality, per-car completeness queries, and rate-source FKs require relations and indexes. |
| Insurance | Typed policy plus typed localized copy and vehicle overrides. Customer-visible translations change together with insurance policy and must be completeness-checked. |
| Customer/driver | Typed eligibility columns plus typed field-rule children. Rules are queried to construct and validate forms; arbitrary JSON/form definitions remain prohibited. |
| Booking workflow | Typed child per supported step. Compound keys prevent duplicates and allow mode/order checks. |
| Document policy | Typed policy/rules/role permissions. Security hard limits are intentionally absent because they are code/system invariants. |
| Payments | Typed policy/methods and localized plain-text instructions. Credentials/provider IDs are intentionally absent. |
| Confirmations | Typed allowlisted sections plus locale content. `safeContent` is sanitized text/HTML output, never executable template source. |
| Legal acceptance policy | Typed FKs to immutable published document versions. Content is not copied into configuration. |
| Legal publication | Separate typed version/translation lifecycle because publication, immutability, language, hashing, and legal authority differ from business configuration. |
| Booking snapshots | Normalized one-to-one/one-to-many typed evidence. Optional parent relations preserve legacy rows; scalar source/version copies support durable rendering and disaster recovery. |
| Customer document | Typed metadata/state only; private object security remains outside configurable policy. |
| Capabilities | Reference tables, not enums, because organizations add roles and permissions evolve. Runtime adoption is deferred. |
| Audit event | Typed category/index keys with constrained JSON summaries. Append-only enforcement requires SQL/permissions in addition to Prisma. |

## 5. Enum rationale

Lifecycle enums are small closed state machines and benefit from database validation. Pricing/month/billing/insurance/field/step/document/payment/deposit/legal modes are code-supported option sets; adding a value necessarily requires code and migration, which is desirable. Customer document types are intentionally limited to ID card, passport, and driving licence; an additional type requires reviewed code/schema work rather than an arbitrary admin-defined category.

| Enum | Rationale |
|---|---|
| `ConfigurationDomainType` | Exactly matches the nine Phase 1 domains and scopes unique version numbers. |
| `ConfigurationVersionStatus` | Separates editable draft, validated candidate, release-frozen version, and archived history. There is no independently active domain state. |
| `ConfigurationValidationStatus` | Mirrors Phase 1 `NOT_VALIDATED`/valid/warning/blocked outcomes and is shared by domains, rates, and releases. |
| `BusinessConfigurationReleaseStatus` | Represents draft/validated/one active/superseded/archived manifest states. |
| `MixedDurationPricingStrategy` | Closed set implemented by the future pricing engine; no formula language. |
| `RentalMonthDefinition` | Captures 28-day, 30-day, and reserved calendar-month semantics in the booking snapshot. |
| `BillableDayMethod` | Captures the approved supported duration-counting strategies and is snapshotted. |
| `PriceTaxTreatment` | States whether base rates are gross or net; tax rate remains basis points. |
| `InsuranceRequirementMode` | Combines disabled/optional/mandatory coherently so disabled plus mandatory cannot coexist. |
| `InsuranceTaxTreatment` | Allows insurance to inherit rental tax or explicitly record gross/net treatment. |
| `InsuranceAvailabilityScope` | Limits overrides to all vehicles or an explicit selected set. |
| `CustomerFieldType` / `CustomerFieldMode` | Typed field allowlist and required/optional/disabled state; prevents arbitrary form definitions. |
| `BookingStepType` / `BookingStepMode` | Typed supported steps and required/optional/hidden behavior; compatibility is release-validated. |
| `CustomerDocumentType` | Initial reviewed sensitive document categories only. |
| `DocumentRequirementMode`, `DocumentSides`, `DocumentSide`, `DocumentUploadStage` | Separates policy requirements from each stored file's slot and timing. |
| `CustomerDocumentUploadStatus`, `MalwareScanStatus`, `DocumentDeletionStatus` | Independent state machines prevent treating upload, scan, and deletion as one ambiguous status. |
| `ConfiguredPaymentMode` | Policy-level superset; does not replace legacy booking payment method or imply an integration. |
| `DepositType`, `PaymentConfirmationMode`, `RemainingBalanceRule` | Closed calculation/workflow choices needed for cross-field validation and snapshots. |
| `ConfirmationSectionType` | Safe allowlist for customer-facing confirmation projections. |
| `LegalDocumentType`, `LegalPublicationStatus`, `LegalAcceptanceRequirement`, `LegalAcceptanceSource` | Closed legal lifecycle/evidence states; source avoids unnecessary telemetry. |
| `AccessRoleStatus` | Allows role retirement without deleting assignments/history. |
| `AuditCategory` | Small stable investigation grouping while action names remain extensible strings. |

Capability keys, access-role keys, audit actions, storage providers/regions, locales, currency codes, MIME types, and engine versions remain strings/reference rows. They are externally extensible or follow standards and would create brittle giant enums.

## 6. Relations, cardinality, uniqueness, and indexes

- One `ConfigurationVersion` has exactly one typed payload logically; each payload has exactly one metadata row through its PK/FK. SQL in section 8 enforces domain/payload correspondence.
- A domain/version number is unique by `@@unique([domain, versionNumber])`.
- One release references exactly one payload from every approved domain and one fleet-rate set. Domain versions/rate sets may be reused by many later releases.
- Release number and fleet-rate-set version number are globally unique monotonic application-assigned integers. Allocation must use a serializable transaction/advisory lock; PostgreSQL sequences may replace manual allocation in raw SQL if preferred.
- One fleet rate set has at most one rate per car. Historical rates restrict car deletion; current Car already uses soft deletion.
- Translation children are unique by version and locale. Rule children are unique by parent and enum key. Booking steps also have unique display order per version.
- One Booking has at most one pricing, customer/driver, and insurance snapshot. It has at most one legal acceptance per legal document type and multiple customer documents.
- Legal versions are unique by `(type, versionNumber)` and `(type, versionLabel)`; translations are unique by document version/locale.
- Storage objects are unique by `(storageProviderId, storageKey)`. Bound document slots are unique by booking/type/side/sequence.
- Capability/role and user/role joins use composite primary keys.
- Audit indexes support actor timelines, action/category filtering, generic targets, configuration activation, document investigations, correlation, and time-range retention queries.

## 7. Money and precision

Continue integer minor units (`Int`) for rates and booking/payment snapshots. This matches `Car.price`, Booking amounts, Payment amount, email formatting, Stripe utilities, and current tests. A signed 32-bit integer supports up to 2,147,483,647 minor units (EUR 21,474,836.47), comfortably above a single rental transaction; server validation will use lower business safety limits and checked arithmetic.

Use uppercase ISO 4217 currency strings constrained to three characters in new tables. Do not silently normalize existing `Payment.currency = "usd"`; existing rows remain untouched. New writes normalize to uppercase at the service boundary. Percentages use integer basis points (0–10,000), replacing floating-point ambiguity in new configuration. Existing CompanySettings floats remain compatibility inputs until cutover.

All multiplication, tax, discount, and deposit calculations use integer arithmetic with an explicit engine-version rounding policy. JSON traces contain integer minor units, never floating money. UI/email formatting consumes the stored currency and integer values. Tests cover overflow guards, tax/deposit rounding, snapshot equality, and legacy rendering.

## 8. Database-specific integrity and immutability SQL

Prisma models do not guarantee immutability, partial uniqueness, cross-table type correspondence, check constraints, or range exclusion. Phase 2B migration SQL must add the following after compatibility queries pass.

### One active release

```sql
CREATE UNIQUE INDEX "BusinessConfigurationRelease_one_active_idx"
ON "BusinessConfigurationRelease" ("status")
WHERE "status" = 'ACTIVE';
```

Activation still runs in one serializable transaction: lock the current active release row (and a fixed advisory-lock key), validate every referenced version/rate/legal publication, mark the prior release `SUPERSEDED`, mark the candidate `ACTIVE`, stamp actors/times, and insert an audit event.

### Bounds and basic checks

```sql
ALTER TABLE "ConfigurationVersion"
  ADD CONSTRAINT "ConfigurationVersion_positive_version_check" CHECK ("versionNumber" > 0),
  ADD CONSTRAINT "ConfigurationVersion_positive_schema_revision_check" CHECK ("schemaVersion" > 0 AND "revision" > 0);

ALTER TABLE "PricingBillingConfigVersion"
  ADD CONSTRAINT "PricingBillingConfig_bounds_check" CHECK (
    "gracePeriodMinutes" BETWEEN 0 AND 720 AND
    "minimumRentalMinutes" BETWEEN 1 AND 525600 AND
    "minimumChargeDays" BETWEEN 1 AND 365 AND
    "taxRateBps" BETWEEN 0 AND 10000
  );

ALTER TABLE "FleetRateSet"
  ADD CONSTRAINT "FleetRateSet_positive_version_check" CHECK ("versionNumber" > 0);

ALTER TABLE "VehicleRentalRate"
  ADD CONSTRAINT "VehicleRentalRate_values_check" CHECK (
    "dailyRate" > 0 AND
    (NOT "weeklyRateEnabled" OR ("weeklyRate" IS NOT NULL AND "weeklyRate" > 0)) AND
    (NOT "monthlyRateEnabled" OR ("monthlyRate" IS NOT NULL AND "monthlyRate" > 0))
  );

ALTER TABLE "CustomerDocument"
  ADD CONSTRAINT "CustomerDocument_metadata_check" CHECK (
    "sequence" > 0 AND "sizeBytes" > 0 AND char_length("checksumSha256") = 64
  );
```

Retention hard bounds are deliberately not encoded until owner/legal approval. Application validation remains provisional and activation is unavailable before that decision.

### Domain/payload correspondence

Phase 2B should add a deferred constraint trigger that, at transaction commit, counts payload rows for each metadata ID and verifies exactly one row exists in the table matching `ConfigurationVersion.domain`. This cannot be expressed in Prisma or a normal CHECK because it spans tables. Draft creation and payload insertion must occur in one transaction. Exact trigger implementation will be included in the Phase 2B SQL review and tested for every domain.

### Immutability

Use a hybrid strategy:

1. Application repositories expose update/delete only for drafts and enforce optimistic `revision` compare-and-increment.
2. Published/released services have no update/delete methods; archival changes status only.
3. PostgreSQL triggers reject update/delete on released/archived configuration metadata and payloads, released/archived fleet sets/rates, published/archived legal versions/translations, active/superseded/archived releases, all booking snapshots/acceptances, and all AuditEvent rows.
4. Production database roles deny direct application DELETE/UPDATE where an append-only table never needs them.
5. Exceptional correction uses a separately credentialed repair role, an approved ticket, backup, and a second immutable audit record. Normal dashboard/API credentials cannot bypass triggers.

The triggers are not “enforced now”; they are proposed Phase 2B SQL and depend on production database-role control. Prisma alone cannot provide the guarantee.

### Booking overlap protection — DEFERRED DATABASE-SPECIFIC SQL

After detecting and resolving any existing overlaps, and after confirming the extension/lock window:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_no_active_vehicle_overlap"
EXCLUDE USING gist (
  "carId" WITH =,
  tsrange("pickupDate", "dropoffDate", '[)') WITH &&
)
WHERE ("status" IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS'));
```

`tsrange` is required because existing columns are `TIMESTAMP(3)` without timezone. This protects booking-versus-booking overlap but cannot protect cross-table `BlockedDate` conflicts. The current Car-row lock, serializable transaction, and in-transaction check remain necessary. A future unified occupancy table is the strongest cross-source invariant but is outside this additive schema gate. Exclusion constraints cannot be added `NOT VALID`, so the preflight query and deployment lock window are mandatory owner/operations decisions.

## 9. Additive migration staging

The stages differ slightly from the illustrative order in the request because document-policy permissions need access-role FKs and legal-acceptance configuration needs legal-document FKs. Foundational role and legal tables must therefore exist before the full release manifest. No stage switches runtime reads.

### Migration 1 — authorization and shared enum foundation

**Changes:** create the new enums, `AccessRole`, `Capability`, `RoleCapability`, and `UserAccessRole`; add only relation metadata to generated Prisma Client. Do not change `User.role` or `requireAdmin()`.

**Locks:** enum/type creation and new tables do not rewrite current tables. Foreign keys to User take brief catalog/table locks. **Backfill:** none in the migration transaction. **Indexes/constraints:** keys and joins shown above. **Validation:** zero duplicate capability/role keys; legacy User counts/roles unchanged. **Recovery:** forward-fix malformed seed metadata; unused new tables can be dropped only before any later stage references them. **Compatibility:** old and new application versions continue using `User.role` exclusively.

### Migration 2 — legal publication foundation

**Changes:** create `LegalDocumentVersion` and `LegalDocumentTranslation` plus legal enums and actor FKs. **Locks:** new tables/FKs only. **Backfill:** import current AGB/privacy `de`/`en` text as DRAFT rows in a separately reviewed data script; do not set PUBLISHED or fabricate approval. **Validation:** unique type/version/label and translation locales; recompute SHA-256 hashes; compare imported source to current pages/messages. **Recovery:** correct drafts forward or archive them; published immutability triggers are installed only once publication workflow exists. **Compatibility:** static legal pages and checkout remain unchanged.

### Migration 3 — configuration domains, release, and fleet rates

**Changes:** create `ConfigurationVersion`, all nine typed payloads/children, `FleetRateSet`, `VehicleRentalRate`, and `BusinessConfigurationRelease`; add User/Car relation metadata; add check/partial-unique/domain triggers after preflight. **Locks:** new tables; FK validation briefly references User, Car, AccessRole, and legal tables. No alteration of `Car.price`. **Backfill:** create a DRAFT fleet-rate set whose daily rates exactly equal `Car.price` for every non-deleted car; weekly/monthly remain null and disabled. Create draft domain versions only after supported defaults are reviewed. Do not create an ACTIVE release automatically. **Validation:** compare rate count/value to Car; ensure one payload per metadata row; ensure all FKs point to correct domain; ensure zero active releases. **Recovery:** correct/replace drafts forward. Do not drop after later booking snapshots reference these tables. **Compatibility:** current booking, admin, catalogue, pricing, tax, payment, email, and availability code continues reading Car/CompanySettings.

### Migration 4 — nullable booking evidence

**Changes:** create `BookingPricingSnapshot`, `BookingCustomerDriverSnapshot`, `BookingInsuranceSnapshot`, and `BookingLegalAcceptance`; add Booking/User/release/rate/legal relations. **Locks:** creation plus brief FK locks against Booking and referenced tables; Booking itself gains no columns or rewrite. **Backfill:** none. Existing bookings intentionally have no child snapshots. **Validation:** snapshot counts initially zero; all old Booking values/checksums/counts unchanged. **Recovery:** before cutover, unused empty tables could be removed by a new forward migration; after any snapshot exists, preserve them and forward-fix. **Compatibility:** existing `pricePerDay`, `totalDays`, totals, payment fields, emails, and pages remain authoritative for legacy and current booking creation.

### Migration 5 — document metadata and append-only audit

**Changes:** create `CustomerDocument` and `AuditEvent`, indexes/checks/FKs, and append-only triggers. **Locks:** new tables and brief FK validation only. **Backfill:** none; never convert public Cloudinary car images or `BlockedDate.reason` data into identity documents. Existing `AdminAuditLog` remains readable and writable until producers migrate. **Validation:** no document rows initially; no provider adapter/routes are added in schema phase; trigger tests reject audit mutation. **Recovery:** forward-fix metadata schema; never delete audit/document evidence after use. **Compatibility:** no upload, download, retention, or audit runtime switches.

### Migration 6 — compatibility data and constraints

**Changes/data:** seed every Phase 1 capability key, create system `ADMIN_COMPAT`, grant all currently approved compatibility capabilities, and assign it to every active legacy `User.role = ADMIN`; retain the enum. Optionally create unprivileged role definitions without assigning them until owner approval. Install/finalize immutability triggers only after the service transaction ordering is proven. **Locks:** normal row writes and index checks; no User table rewrite. **Validation:** every active ADMIN has ADMIN_COMPAT; no USER receives it; legacy admin count and sessions unchanged; capability keys exactly match `lib/authorization/capabilities.ts`. **Recovery:** correct mappings forward while runtime still uses legacy `requireAdmin()`; runtime adoption is a later feature phase.

### Later staged constraints and overlap

New-booking snapshot non-nullness should be enforced by application cutover plus a deployment marker/check, not by making a child relation mandatory for historical Booking rows. The booking overlap exclusion constraint is a separately approved hardening migration after overlap detection, extension approval, and maintenance-window planning.

## 10. Backfill and validation queries

Safe evidence-backed backfills only:

- `VehicleRentalRate.dailyRate = Car.price`; currency comes from the reviewed general/company currency for the draft set. No weekly/monthly rate is inferred.
- Capability keys come from the Phase 1 constant; ADMIN-compatible assignments come from existing active ADMIN rows.
- Static legal text may become drafts with hashes, never published evidence.
- Existing bookings, acceptances, insurance, documents, customer/driver data, and audit events are not synthesized.

Phase 2B preflight/verification includes:

```sql
-- Rate backfill equality
SELECT c.id, c.price, r."dailyRate"
FROM "Car" c
LEFT JOIN "VehicleRentalRate" r
  ON r."carId" = c.id AND r."fleetRateSetId" = $1
WHERE c."isDeleted" = false
  AND (r.id IS NULL OR r."dailyRate" <> c.price);

-- Existing active booking overlaps before exclusion constraint
SELECT a.id AS booking_a, b.id AS booking_b, a."carId"
FROM "Booking" a
JOIN "Booking" b
  ON a."carId" = b."carId" AND a.id < b.id
 AND a."pickupDate" < b."dropoffDate"
 AND a."dropoffDate" > b."pickupDate"
WHERE a.status IN ('PENDING','CONFIRMED','IN_PROGRESS')
  AND b.status IN ('PENDING','CONFIRMED','IN_PROGRESS');

-- Legacy admin compatibility coverage
SELECT u.id
FROM "User" u
LEFT JOIN "UserAccessRole" ur ON ur."userId" = u.id
LEFT JOIN "AccessRole" r ON r.id = ur."accessRoleId" AND r.key = 'ADMIN_COMPAT'
WHERE u.role = 'ADMIN' AND u."isActive" = true AND r.id IS NULL;
```

Before/after table counts and stable hashes/aggregates are recorded for User, Car, Booking, Payment, BlockedDate, Session, Account, AdminAuditLog, and CompanySettings. No seed, reset, push, deploy, or migration command runs until Phase 2B approval.

## 11. Historical and runtime compatibility

- **Vehicles:** `Car.price` remains required and unchanged; all existing create/edit/display code continues using it. First draft rates copy it exactly.
- **Bookings:** no existing column changes. Optional child snapshots leave old rows valid and readable. Later readers use snapshot when present and legacy fields otherwise.
- **Totals:** existing `pricePerDay`, `totalDays`, `totalPrice`, `depositAmount`, and `guaranteeAmount` are never recalculated or rewritten.
- **Payments:** existing Payment rows/statuses/currency and Booking payment method remain unchanged. New payment policy does not enable a provider.
- **Admins/auth:** legacy Role enum, JWT/session shape, Google accounts, Account/Session tables, active status, and `requireAdmin()` remain unchanged. New role tables are shadow data until explicit runtime cutover.
- **Email:** current functions keep reading Booking and CompanySettings. No confirmation snapshot/outbox integration occurs in Phase 2B schema-only deployment.
- **Availability:** `BlockedDate`, exact-tuple uniqueness, Car locking, serializable transactions, lifecycle maintenance, and half-open overlap queries remain unchanged. Exclusion SQL is deferred.
- **CompanySettings:** remains the live company/bank/tax/deposit source until later cutover; no field is removed or reinterpreted.

## 12. Rollback and forward recovery

Do not treat rollback as deleting applied migration history. Before any new table is referenced, a reviewed reversal migration is technically possible, but the preferred strategy is still a forward correction because migration history has prior drift.

After a release, legal publication, snapshot, document, role assignment, or audit event exists, never drop or rewrite its evidence. Deploy the old application against additive tables if application rollback is needed, then apply a forward schema/data repair. Configuration rollback is a new release referencing prior valid domain/rate versions. Legal correction is a new publication. Snapshot correction requires the exceptional repair process and an immutable audit event.

Production steps require a verified backup, restore rehearsal, migration statement timeout, lock monitoring, before/after counts, and a named recovery owner. A failed concurrent-index/trigger step is corrected with a new forward migration or idempotent reviewed SQL; applied migration files are never edited.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Shared metadata points to wrong/multiple payloads | Explicit release FKs to typed payloads plus deferred domain/payload trigger and service transaction tests. |
| Activated data is mutated through generic Prisma update | Repository guards, optimistic revision, no mutation API, SQL immutability triggers, restricted production DB role, audited repair path. |
| Large migration lock or rewrite | New tables/nullable relations only; no Booking/Car scalar rewrite; separate indexes/constraints and inspect locks in rehearsal. |
| Historical migration replay fails | Rehearse all twelve existing migrations first; preserve no-op/correction files; forward-fix only. |
| Rate backfill invents discounts | Copy only daily Car.price; weekly/monthly null/disabled; draft remains inactive. |
| Legacy bookings become unreadable | Optional child snapshots and explicit legacy reader; old columns untouched. |
| Role tables accidentally grant access | Runtime continues using legacy Role; seed only ADMIN compatibility; capability cutover separately reviewed. |
| Payment enum implies integration | Release validator checks implemented methods; credentials absent; current Stripe route remains 410. |
| Document metadata is mistaken for secure storage | No upload route/provider adapter; provider/region/scanner/security gate remains mandatory; no public URL column. |
| Legal drafts are mistaken for approved publications | Import as DRAFT only; publication requires authority and immutable service/trigger. |
| Int overflow/rounding drift | Checked integer engine, bounded inputs, basis points, engine version, unit/rounding tests. |
| PostgreSQL timestamp semantics cause confusion | Continue current UTC-normalized application convention; use `tsrange` for current columns; do not silently convert types. |
| Exclusion constraint blocks deployment | Preflight overlaps, extension approval, maintenance window; defer until clean. |
| Audit JSON leaks sensitive data | Allowlisted summary builders, redaction tests, size limits, no document contents/secrets/URLs, append-only enforcement. |

## 14. Genuine owner decisions

| Decision | Options | Recommended default | Consequence | Blocks schema creation? | Safe to defer? |
|---|---|---|---|---|---|
| Storage provider | S3-compatible EU provider, AWS S3, GCS, Azure | Provider-neutral metadata/interface; choose provider before upload implementation | Determines adapter, encryption, DPA, operations | No | Yes, but blocks documents runtime |
| EU region | Provider-specific EU region | One explicitly contracted EU region stored as evidence | Data residency and latency | No | Yes, but blocks documents runtime |
| Hard retention maximum/start event | Legal-defined bound and trigger event | No activation until counsel approves; metadata supports deadline | Determines CHECK/service scheduling | No for nullable metadata table; yes for document policy activation | Yes |
| Legal hold authority/process | Compliance-only, dual approval, legal team | Restricted compliance capability plus audited reason and review date | Controls deletion exceptions | No | Yes, blocks retention runtime |
| Initial role assignments | ADMIN-compatible only; predefined least-privilege roles; custom | Seed ADMIN_COMPAT only, define others after approval | Least privilege and operational access | No | Yes |
| Two-person activation | Single authorized actor; maker-checker | Defer schema support unless organizational policy requires it; add approval model if required | Would require release approval records before activation | No for core schema | Yes before activation UI |
| Payment integrations | Current transfer/pickup; Stripe; other | Only transfer/pay-at-pickup considered implemented | Prevents false payment promises | No | Provider modes defer safely |
| Legal publication authority | Super admin, legal manager, dual approval | Dedicated legal publisher capability; legal owner named | Determines who may publish immutable text | No | Yes before publication runtime |
| DB immutability enforcement | App only, triggers, restricted role, hybrid | Hybrid triggers + restricted application role | Stronger evidence, more operational complexity | No for table creation; yes before live evidence | Partly |
| Calendar-month release-one support | Include now; enum reserved but validator blocks; omit enum | Keep enum/columns, block activation until semantics approved | Avoids later schema churn without promising behavior | No | Yes |
| Customer document access | Metadata only, short-lived view, download | Metadata/status only; no content download by default | Privacy/support tradeoff | No | Yes before access endpoints |
| Malware scanner | Provider service, third party, self-hosted | Interface/state now; select managed EU-compatible scanner later | Determines scan refs/retry/SLA | No | Yes, blocks document READY state |
| Test database | CI PostgreSQL service, disposable managed branch, Testcontainers | Dedicated disposable PostgreSQL matching production major version | Needed for migrations/triggers/concurrency | No for proposal | No before Phase 2B execution/rehearsal |
| Overlap constraint/extension | `btree_gist`, retain app-only, unified occupancy later | Approve `btree_gist` after overlap/lock rehearsal | Strong booking invariant; deployment lock | No | Yes, current locking remains |
| Raw IP for legal/audit evidence | Store raw, keyed hash, omit | Omit raw; optional keyed hash only with purpose/retention | Data minimization vs investigation detail | No | Yes |

## 15. Exact Phase 2B file scope

Expected existing files:

- `prisma/schema.prisma` — apply the approved enums/models/relations only.
- `prisma/seed.ts` — capability/access-role idempotent seed support; no active business release or invented legal approval.
- `prisma/backup-data.ts` — include new configuration/legal/snapshot/audit metadata while excluding document contents, signed URLs, and secrets.
- `prisma/MIGRATION_NOTES.md` — append the approved staged migration/recovery notes.

Expected new files after separate execution approval:

- six timestamped `prisma/migrations/*/migration.sql` files matching section 9;
- focused scripts under `scripts/` for non-destructive preflight, rate-draft backfill, legal-draft import, capability compatibility mapping, and migration verification;
- integration tests under `tests/integration/database/` for constraints, immutability, replay, and compatibility.

No production route, Server Action, booking/pricing/email/admin/customer component, environment file, or Graphify artifact should change in schema-only Phase 2B.

## 16. Approval checklist

- [ ] Approve the shared metadata + nine typed payload hybrid.
- [ ] Approve explicit release foreign keys and separate fleet-rate set.
- [ ] Approve integer minor units, three-letter currency, and basis-point percentages.
- [ ] Approve normalized optional booking snapshots and combined renter/primary-driver snapshot.
- [ ] Approve legal version/translation lifecycle and release-based selection.
- [ ] Approve private document metadata fields and absence of public URLs/binary data.
- [ ] Approve AccessRole shadow tables while preserving legacy Role/ADMIN runtime.
- [ ] Approve extensible audit action strings plus stable category enum.
- [ ] Decide whether SQL immutability triggers are required in the initial schema migrations.
- [ ] Decide the disposable PostgreSQL strategy before any migration execution.
- [ ] Approve the six-stage additive migration order and evidence-backed backfills.
- [ ] Confirm no active release, legal publication, or historical acceptance is seeded automatically.
- [ ] Approve or defer the overlap exclusion constraint and `btree_gist` extension.
- [ ] Confirm the exact Phase 2B file scope.

Approval of this document authorizes preparing/applying the exact schema and migration files only if the owner explicitly starts Phase 2B. It does not authorize running migrations against any database.

## 17. Phase 2A validation evidence

Only non-mutating commands were run:

| Command | Result |
|---|---|
| `pnpm typecheck` | Pass. |
| `pnpm test:run` | Pass: 4 files, 22 tests. |
| `pnpm exec prisma validate` | Pass for the unchanged current `prisma/schema.prisma`. The proposed definitions were not applied during Phase 2A. |
| `pnpm build` | Pass: compilation, TypeScript, and all 40 routes/pages completed. |

The build retained the known warnings about stale `baseline-browser-mapping` data and Next.js choosing `/Users/emanuelrusu` as the workspace root because another lockfile exists. No Prisma migration, deploy, push, reset, seed, database query, or SQL command was run.
