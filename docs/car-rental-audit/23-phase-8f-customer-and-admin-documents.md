# Phase 8F-B — Customer/admin private documents schema gate

Date: 2026-07-13. Status: **blocked at the required checkout-persistence stop point; schema approval required**.

Phase 8F-A is approved and unchanged. No customer/admin Phase 8F-B UI, upload route, worker route, schedule, production feature, production Blob store, schema, migration, database row, role assignment, or document object was created or changed during this gate review. No production, staging, shared, repository-configured, or personal-data system was contacted.

## Decision

The current checkout architecture cannot safely preserve the authoritative customer journey across asynchronous manual review without creating a `Booking` too early.

Phase 8F-B implementation must stop until a typed pre-booking application model and additive migration are approved.

The existing `DocumentUploadSession` is necessary document evidence, but it is not a complete pending booking/application record. Using browser state, URL parameters, audit metadata, arbitrary JSON, or an early `Booking` to fill this gap would violate the approved architecture and the Phase 8F-B instructions.

## Exact architectural conflict

### Current browser state

`app/[locale]/checkout/[id]/checkout-client.tsx` keeps these booking inputs in component state until the customer presses the final confirmation button:

- customer and driver fields;
- insurance selection;
- legal acknowledgements;
- payment method;
- pickup location;
- pickup and return time values.

Only some date/location values are reflected in the URL. There is no server-owned draft/application identifier and no recovery path for the complete form after refresh, sign-out, another device, or a review delay.

The current confirmation handler sends all inputs directly to `createBooking()`. It does not create or update an intermediate application.

### Current booking transaction

`app/actions/bookings.ts` calls `createAuthoritativeBooking()` immediately after validating the final browser submission.

`lib/pricing/prisma-booking-service.ts` then performs one serializable transaction that:

1. locks and checks the vehicle;
2. recalculates availability and pricing;
3. resolves the active configuration;
4. validates customer/driver fields and eligibility;
5. checks legal acknowledgements;
6. creates the final `Booking`;
7. creates `BookingPricingSnapshot`;
8. creates `BookingCustomerDriverSnapshot`;
9. creates `BookingInsuranceSnapshot`;
10. creates `BookingLegalAcceptance` evidence.

Those snapshot/evidence tables all require a `bookingId`. They cannot persist pre-review progress without first creating a `Booking`.

### Current document session

`DocumentUploadSession` persists:

- customer user;
- vehicle;
- pickup and return timestamps;
- locale;
- exact Business Configuration release;
- exact document-policy version;
- expiry/status/revision;
- optional final Booking binding.

It does **not** persist:

- pickup location;
- payment method;
- customer and driver inputs;
- selected insurance option;
- exact legal acknowledgement evidence;
- finalization/idempotency state for the complete application.

The missing facts cannot be reconstructed safely from `User`, the browser, current configuration, audit events, document metadata, or the eventual active release. In particular, legal acceptance must retain the exact published translation, content hash, acceptance time, source, release, and legal-policy version.

### Why the existing models cannot be reused as-is

- Creating `Booking(status=PENDING)` before document approval is explicitly prohibited and would also make the existing booking/history/availability behavior treat the record as a real Booking.
- Extending `DocumentUploadSession` with unrelated booking fields would turn the document lifecycle root into an untyped booking draft and still leave legal acceptance/customer/insurance evidence without appropriate relational ownership.
- Storing the draft in `AuditEvent.metadata` or another JSON payload would make audit data primary workflow state, which is prohibited.
- Keeping the draft only in React, URL, session storage, or local storage would make browser state authoritative and would not survive the required review journey safely.
- Re-reading whichever release is active after review could mismatch the immutable release/document-policy provenance already attached to uploaded documents. Release activation is required to affect future applications only.

## Proposed typed pending-booking/application model

The following proposal is strictly additive. It does not change historical `Booking`, snapshot, acceptance, document, review, or audit evidence.

### Enums

```prisma
enum BookingApplicationStatus {
  DRAFT
  DOCUMENTS_PENDING
  READY_TO_BOOK
  CONSUMED
  EXPIRED
  ABORTED
}
```

Terminal states are `CONSUMED`, `EXPIRED`, and `ABORTED`. `READY_TO_BOOK` is a recalculated summary, not browser authority. A document review decision can move the summary between `DOCUMENTS_PENDING` and `READY_TO_BOOK`; final Booking creation always rechecks every rule.

### `BookingApplication`

```prisma
model BookingApplication {
  id                     String                   @id @default(cuid())
  customerUserId         String
  carId                  String
  configurationReleaseId String
  locale                 String                   @db.VarChar(10)
  pickupAt               DateTime
  returnAt               DateTime
  location               String
  paymentMethod          BookingPaymentMethod
  status                 BookingApplicationStatus @default(DRAFT)
  revision               Int                      @default(1)
  expiresAt              DateTime
  readyCheckedAt         DateTime?
  consumedAt             DateTime?
  abortedAt              DateTime?
  bookingId              String?                  @unique
  createdAt              DateTime                 @default(now())
  updatedAt              DateTime                 @updatedAt

  customer            User                            @relation("BookingApplicationCustomer", fields: [customerUserId], references: [id], onDelete: Restrict)
  car                 Car                             @relation(fields: [carId], references: [id], onDelete: Restrict)
  configurationRelease BusinessConfigurationRelease    @relation(fields: [configurationReleaseId], references: [id], onDelete: Restrict)
  booking             Booking?                        @relation(fields: [bookingId], references: [id], onDelete: Restrict)
  customerDriver      BookingApplicationCustomerDriver?
  insuranceSelection  BookingApplicationInsuranceSelection?
  legalAcceptances    BookingApplicationLegalAcceptance[]
  documentUploadSession DocumentUploadSession?

  @@index([customerUserId, status, expiresAt])
  @@index([carId, pickupAt, returnAt])
  @@index([configurationReleaseId])
  @@index([status, expiresAt])
}
```

Requirements:

- `pickupAt < returnAt`, positive revision, nonblank bounded location, supported locale, and expiry after creation;
- immutable customer, vehicle, and release after document intent creation;
- mutable dates/location/payment only through a revision-checked service that revalidates configuration and invalidates stale readiness;
- exactly one final Booking, linked only in the final serializable transaction;
- no availability reservation during manual review; final availability may fail and the customer must be told this clearly.

### `BookingApplicationCustomerDriver`

```prisma
model BookingApplicationCustomerDriver {
  id                            String    @id @default(cuid())
  bookingApplicationId          String    @unique
  customerDriverConfigVersionId String
  revision                      Int       @default(1)
  firstName                     String
  lastName                      String
  email                         String
  phone                         String?
  dateOfBirth                   DateTime? @db.Date
  country                       String?   @db.VarChar(2)
  address                       String?
  city                          String?
  postalCode                    String?
  nationality                   String?   @db.VarChar(2)
  licenceNumber                 String?
  licenceIssueDate              DateTime? @db.Date
  licenceExpiryDate             DateTime? @db.Date
  licenceIssuingCountry         String?   @db.VarChar(2)
  capturedAt                    DateTime
  validatedAt                   DateTime?
  createdAt                     DateTime  @default(now())
  updatedAt                     DateTime  @updatedAt

  bookingApplication BookingApplication        @relation(fields: [bookingApplicationId], references: [id], onDelete: Restrict)
  customerDriverConfig CustomerDriverConfigVersion @relation(fields: [customerDriverConfigVersionId], references: [configurationVersionId], onDelete: Restrict)

  @@index([customerDriverConfigVersionId])
}
```

This is typed draft state. On finalization, the service re-normalizes and revalidates it against the application's exact release and writes the existing immutable `BookingCustomerDriverSnapshot`.

### `BookingApplicationInsuranceSelection`

```prisma
model BookingApplicationInsuranceSelection {
  id                       String   @id @default(cuid())
  bookingApplicationId     String   @unique
  insuranceConfigVersionId String
  selected                 Boolean
  revision                 Int      @default(1)
  capturedAt               DateTime
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  bookingApplication BookingApplication   @relation(fields: [bookingApplicationId], references: [id], onDelete: Restrict)
  insuranceConfig    InsuranceConfigVersion @relation(fields: [insuranceConfigVersionId], references: [configurationVersionId], onDelete: Restrict)

  @@index([insuranceConfigVersionId])
}
```

Only the customer's selection is persisted. Price, availability, requirement mode, day count, and subtotal are recalculated from the application's exact immutable release during finalization and written to the existing `BookingInsuranceSnapshot`.

### `BookingApplicationLegalAcceptance`

```prisma
model BookingApplicationLegalAcceptance {
  id                             String                @id @default(cuid())
  bookingApplicationId           String
  legalDocumentTranslationId     String
  customerUserId                 String
  configurationReleaseId         String
  legalAcceptanceConfigVersionId String
  documentType                   LegalDocumentType
  documentVersionNumber          Int
  locale                         String                @db.VarChar(10)
  contentHash                    String                @db.Char(64)
  accepted                       Boolean
  acceptedAt                     DateTime
  source                         LegalAcceptanceSource
  contentSnapshot                String?               @db.Text
  createdAt                      DateTime              @default(now())

  bookingApplication       BookingApplication            @relation(fields: [bookingApplicationId], references: [id], onDelete: Restrict)
  legalDocumentTranslation LegalDocumentTranslation      @relation(fields: [legalDocumentTranslationId], references: [id], onDelete: Restrict)
  customer                 User                          @relation("BookingApplicationLegalAcceptanceCustomer", fields: [customerUserId], references: [id], onDelete: Restrict)
  configurationRelease     BusinessConfigurationRelease  @relation(fields: [configurationReleaseId], references: [id], onDelete: Restrict)
  legalAcceptanceConfig    LegalAcceptanceConfigVersion  @relation(fields: [legalAcceptanceConfigVersionId], references: [configurationVersionId], onDelete: Restrict)

  @@unique([bookingApplicationId, documentType])
  @@index([customerUserId, acceptedAt])
  @@index([configurationReleaseId])
  @@index([legalAcceptanceConfigVersionId])
}
```

The acceptance is append-only once the application enters `DOCUMENTS_PENDING`. If customer/driver/date changes require a fresh acceptance under policy, the service creates a new application or performs an explicitly defined revision flow; it never silently changes the accepted release/content hash. Finalization copies the exact evidence into the existing `BookingLegalAcceptance` rows while preserving `acceptedAt`.

### `DocumentUploadSession` binding

Add one nullable historical-compatible field and relation:

```prisma
model DocumentUploadSession {
  bookingApplicationId String? @unique
  bookingApplication   BookingApplication? @relation(fields: [bookingApplicationId], references: [id], onDelete: Restrict)
}
```

For every new Phase 8F-B session, `bookingApplicationId` is mandatory at the service/database boundary. A deferred consistency trigger verifies equal customer, vehicle, dates, locale, release, and document-policy membership. Historical Phase 8 sessions remain null and unchanged.

Required inverse relations are added to `User`, `Car`, `Booking`, `BusinessConfigurationRelease`, `CustomerDriverConfigVersion`, `InsuranceConfigVersion`, `LegalDocumentTranslation`, and `LegalAcceptanceConfigVersion`.

## Required database protections

The additive migration should include:

- positive revision and valid timestamp/status checks;
- one application-to-Booking and one application-to-document-session relationship;
- restrictive foreign keys and no lifecycle evidence cascades;
- application transition and terminal-immutability trigger;
- deferred application/session/release/policy consistency trigger;
- immutable/append-only legal acceptance after document review begins;
- exact legal translation/content-hash/release/policy consistency checks;
- customer-driver and insurance config versions belonging to the application's release;
- `CONSUMED` requiring a matching Booking, consumed session, exact document provenance, and all final snapshots/evidence;
- historical rows remaining unchanged; no backfill inference;
- preflight checks before indexes/triggers and forward-only recovery after application rows exist.

No primary application state may be stored in audit JSON. `AuditEvent` remains append-only evidence for safe application create/update/finalize/expire/abort events.

## Final authoritative booking orchestration after approval

The final service should accept only an authenticated application ID and expected revision, not a new copy of the booking form from the browser.

Inside one serializable PostgreSQL transaction it must:

1. lock the application, document session, and vehicle;
2. return the already-created Booking for an idempotent consumed application;
3. verify ownership, active user, nonterminal state, expiry, and revision;
4. load the exact immutable Business Configuration release bound to the application;
5. verify the session uses that release and its exact document policy;
6. recalculate vehicle availability;
7. recalculate pricing and insurance from the exact application release;
8. normalize and validate the typed customer/driver record and eligibility;
9. verify exact legal acceptance evidence;
10. recalculate document readiness from current persisted document rows;
11. create the final `Booking` and existing pricing/customer/insurance/legal snapshots;
12. link current approved documents to the Booking;
13. consume the document session and application atomically.

Blob objects do not participate in this transaction. No object move/copy is needed; the approved immutable-pathname and compensation model remains unchanged.

If availability, pricing, eligibility, legal acceptance, or document readiness fails, no Booking is created. The application remains recoverable when the failure is correctable and transitions to an appropriate terminal state only through an explicit service action.

## Phase 8F-B work intentionally not started

Pending schema approval, the following requested work remains blocked:

- customer upload/status/replacement UI and routes;
- complete document-policy administration form;
- booking finalization/readiness integration;
- admin review queue and review screens;
- legal-hold/deletion administration screens;
- worker Route Handlers and non-production schedules;
- release/health activation integration;
- synthetic Playwright flows and visual verification;
- production provisioning checklist execution.

The already approved Phase 8F-A protected view/download/review/queue/restricted-role Route Handlers and services remain unchanged.

## Approval request

Please approve or amend:

- the `BookingApplicationStatus` enum;
- `BookingApplication` and its exact release/Booking relationship;
- typed customer-driver and insurance-selection records;
- append-only pre-booking legal acceptance evidence;
- the nullable historical-compatible `DocumentUploadSession.bookingApplicationId` binding;
- the transition, consistency, finalization, and no-backfill protections above;
- the rule that existing applications continue on their exact bound release while newly activated releases affect only future applications;
- a new forward-only additive migration and disposable-PostgreSQL verification for these models.

Approval authorizes only the additive schema/migration phase unless Phase 8F-B implementation is explicitly reauthorized after review of the exact Prisma and SQL diff.
