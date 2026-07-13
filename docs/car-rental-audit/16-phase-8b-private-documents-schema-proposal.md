# Phase 8B — Exact private-document schema and migration proposal

> Supersession note (2026-07-13): the provider-neutral schema remains authoritative and compatible. The AWS-specific production assumptions and adapter plan are superseded by Vercel Blob Private Storage in `19-phase-8e-vercel-blob-design.md`; the AWS analysis is retained as an evaluated alternative.

Review date: 2026-07-13. Status: **proposal only; approval required before Phase 8C or any schema/migration change**.

No Prisma schema, migration, dependency, application behavior, database, object store, scanner, upload route, signed-access path, retention job, deletion job, or cloud resource was changed or contacted during Phase 8B.

## 1. Outcome and gate decision

The current schema is not sufficient for the approved Phase 8 private-document lifecycle. It stores useful final-object metadata, but it cannot prove the typed pre-booking upload context, exact release-bound requirement, quarantine verification, scan-attempt history, replacement chain, retention basis, legal-hold authority, or provider-confirmed deletion history.

The exact proposal is strictly additive to existing tables and values:

- preserve every existing `CustomerDocument`, Booking, release, snapshot, acceptance, capability, role, and audit row;
- add upload-session and upload-intent roots rather than putting staged state in JSON;
- add nullable provenance/evidence fields to `CustomerDocument`, identified by `evidenceSchemaVersion`;
- add append-only malware-scan and deletion-attempt evidence;
- add typed legal-hold and deletion-request lifecycles;
- retain `AuditEvent` as the sole application access-audit ledger;
- seed narrow roles/capabilities without assigning any user or granting ordinary legacy administrators document-content access;
- enforce lifecycle integrity with application services plus PostgreSQL checks, foreign keys, partial uniqueness, deferred consistency triggers, append-only triggers, and restricted database permissions.

Phase 8C must not start until the owner approves this exact model and migration strategy. The next step after approval is to edit `schema.prisma` and generate/review the exact SQL; it is not production deployment authorization.

## 2. Current-schema findings

### 2.1 Existing facts retained

The existing schema already has:

- stable `IDENTITY_CARD`, `PASSPORT`, and `DRIVING_LICENCE` reference records;
- immutable released `DocumentPolicyConfigVersion`, `DocumentRequirementRule`, and `DocumentPolicyRolePermission` payloads;
- rule mode, file count, single/front-back structure, and upload stage;
- final `CustomerDocument` ownership, optional Booking relation, uploader, type, side, sequence, provider/region/key, filename, MIME/type/extension, size, SHA-256, upload/scan status, retention deadline, hold summary, deletion summary, and timestamps;
- `documents.view`, `documents.download`, and `documents.delete` capability keys;
- append-only `AuditEvent` with actor, release/document references, safe summaries, correlation, and time.

These fields remain in place. `Car.price` and all Phase 1–7 booking evidence remain untouched.

### 2.2 Exact gaps

| Required integrity fact | Current gap | Proposed owner |
|---|---|---|
| Pre-booking customer/vehicle/date/release context | No upload-session model | `DocumentUploadSession` |
| Intent expiry, idempotency, expected checksum/type/slot | No typed upload intent | `DocumentUploadIntent` |
| Exact release, policy, and rule provenance | Missing on final document | Nullable Phase 8 fields plus FKs/triggers |
| Logical slot versus retry/sequence | Existing `sequence` conflates them | `slotNumber`, `attemptNumber`, current-record partial uniqueness |
| Container/version/upload reference | Provider/region/key only | Intent and final-object fields |
| Browser MIME and file-policy version | Not retained | Intent/final evidence fields |
| Explicit quarantine state | Implied only | `DocumentQuarantineStatus` and timestamps |
| Verifier identity/version/time/failure | Missing | Final document verification fields |
| Scan attempt history and callback deduplication | One mutable status/reference | Append-only `DocumentMalwareScanAttempt` |
| Replacement chain | Missing | Self-relation plus guarded attempt/current semantics |
| Retention basis/time/policy snapshot | Only absolute deadline | Typed basis and snapshot fields |
| Hold actor/reason/apply/release evidence | Boolean only | `DocumentLegalHold` |
| Deletion request and provider attempts | Summary only | `DocumentDeletionRequest` and append-only attempts |
| Access issuance | Audit ledger exists | Continue using `AuditEvent`; no token table |
| Incident reference | Correlation and safe audit metadata exist | Continue using `AuditEvent`; external case ID may be a bounded safe correlation value |

Audit JSON, filenames, object-key parsing, current configuration, and in-memory state must not substitute for any typed fact above.

## 3. Exact enum proposal

Existing enum values are never removed or renamed.

```prisma
enum IdentityDocumentChoice {
  DISABLED
  IDENTITY_CARD_ONLY
  PASSPORT_ONLY
  EITHER_IDENTITY_CARD_OR_PASSPORT
  BOTH
}

enum DocumentUploadSessionStatus {
  OPEN
  CONSUMED
  EXPIRED
  ABORTED
}

enum DocumentUploadIntentStatus {
  INTENT_CREATED
  UPLOADING
  UPLOADED
  VERIFYING
  QUARANTINED
  SCAN_PENDING
  CLEAN
  REJECTED
  FAILED
  ABORTED
  EXPIRED
}

enum DocumentQuarantineStatus {
  QUARANTINED
  RELEASED
  REJECTED
  DELETED
}

enum DocumentRetentionBasis {
  UPLOAD_SESSION_EXPIRY
  BOOKING_CANCELLED
  RENTAL_COMPLETED
  REJECTED_UPLOAD
  INCIDENT_PRESERVATION
}

enum DocumentDeletionRequestStatus {
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  FAILED
}

enum DocumentDeletionAttemptOutcome {
  DELETED
  ALREADY_MISSING
  RETRYABLE_FAILURE
  PERMANENT_FAILURE
}
```

Extend the existing scan summary enum:

```prisma
enum MalwareScanStatus {
  PENDING
  CLEAN
  INFECTED
  FAILED
  NOT_AVAILABLE
  ERROR
  TIMEOUT
  UNSUPPORTED
  PASSWORD_PROTECTED
}
```

`FAILED` and `NOT_AVAILABLE` remain readable for historical compatibility. Phase 8 services write the more precise terminal values and never accept either legacy value as clean evidence.

## 4. Exact document-policy proposal

The file allowlist, 10 MiB byte ceiling, private-storage requirement, scanning requirement, and 365-day hard retention ceiling remain code/deployment invariants. They are not administrator-selectable columns.

```prisma
model DocumentPolicyConfigVersion {
  configurationVersionId      String @id
  retentionPreferenceDays     Int
  identityDocumentChoice      IdentityDocumentChoice @default(DISABLED)
  showReminderInConfirmation  Boolean @default(true)

  version                 ConfigurationVersion                @relation(fields: [configurationVersionId], references: [id], onDelete: Restrict)
  requirements            DocumentRequirementRule[]
  rolePermissions         DocumentPolicyRolePermission[]
  releases                BusinessConfigurationRelease[]
  uploadSessions          DocumentUploadSession[]
}

model DocumentRequirementRule {
  documentPolicyConfigVersionId String
  documentTypeId                String
  mode                          DocumentRequirementMode
  fileCount                     Int
  sides                         DocumentSides
  uploadStage                   DocumentUploadStage

  documentPolicyConfig DocumentPolicyConfigVersion @relation(fields: [documentPolicyConfigVersionId], references: [configurationVersionId], onDelete: Cascade)
  documentType         DocumentTypeDefinition      @relation(fields: [documentTypeId], references: [id], onDelete: Restrict)
  translations        DocumentRequirementTranslation[]
  uploadIntents       DocumentUploadIntent[]
  customerDocuments   CustomerDocument[]

  @@id([documentPolicyConfigVersionId, documentTypeId])
  @@index([documentTypeId, mode])
}

model DocumentRequirementTranslation {
  id                            String @id @default(cuid())
  documentPolicyConfigVersionId String
  documentTypeId                String
  locale                        String @db.VarChar(10)
  instructions                  String @db.Text
  createdAt                     DateTime @default(now())
  updatedAt                     DateTime @updatedAt

  documentRequirement DocumentRequirementRule @relation(
    fields: [documentPolicyConfigVersionId, documentTypeId],
    references: [documentPolicyConfigVersionId, documentTypeId],
    onDelete: Cascade
  )

  @@unique([documentPolicyConfigVersionId, documentTypeId, locale])
  @@index([locale])
  @@index([documentTypeId, locale])
}

model DocumentPolicyRolePermission {
  documentPolicyConfigVersionId String
  accessRoleId                  String
  mayView                       Boolean @default(false)
  mayDownload                   Boolean @default(false)
  mayDelete                     Boolean @default(false)
  mayManageLegalHold            Boolean @default(false)

  documentPolicyConfig DocumentPolicyConfigVersion @relation(fields: [documentPolicyConfigVersionId], references: [configurationVersionId], onDelete: Cascade)
  accessRole           AccessRole                  @relation(fields: [accessRoleId], references: [id], onDelete: Restrict)

  @@id([documentPolicyConfigVersionId, accessRoleId])
  @@index([accessRoleId])
}
```

Identity choice is an aggregate constraint over the existing Identity Card and Passport rule rows. It is not a fourth document type. `BOTH` requires both rules; `EITHER_IDENTITY_CARD_OR_PASSPORT` creates one logical alternative requirement satisfied by either clean type. Phase 8 supports required `DURING_BOOKING` documents only; a required later stage remains a release blocker.

Translations are plain text, locale-normalized, bounded, and immutable when the parent configuration is released. Aggregate Phase 8 policy checks apply only when the parent `ConfigurationVersion.schemaVersion >= 2`; Phase 8 policy services create schema version 2. Existing schema-version-1 policies retain their neutral defaults without being retroactively reinterpreted or invalidated.

## 5. Exact upload-session and intent proposal

```prisma
model DocumentUploadSession {
  id                            String @id @default(cuid())
  customerUserId                String
  carId                         String
  pickupAt                      DateTime
  returnAt                      DateTime
  locale                        String @db.VarChar(10)
  configurationReleaseId        String
  documentPolicyConfigVersionId String
  bookingId                     String? @unique
  status                        DocumentUploadSessionStatus @default(OPEN)
  revision                      Int @default(1)
  expiresAt                     DateTime
  consumedAt                    DateTime?
  abortedAt                     DateTime?
  createdAt                     DateTime @default(now())
  updatedAt                     DateTime @updatedAt

  customer             User                         @relation("DocumentUploadSessionCustomer", fields: [customerUserId], references: [id], onDelete: Restrict)
  car                  Car                          @relation(fields: [carId], references: [id], onDelete: Restrict)
  configurationRelease BusinessConfigurationRelease @relation(fields: [configurationReleaseId], references: [id], onDelete: Restrict)
  documentPolicy       DocumentPolicyConfigVersion  @relation(fields: [documentPolicyConfigVersionId], references: [configurationVersionId], onDelete: Restrict)
  booking              Booking?                     @relation(fields: [bookingId], references: [id], onDelete: Restrict)
  intents              DocumentUploadIntent[]
  customerDocuments    CustomerDocument[]

  @@index([customerUserId, status, expiresAt])
  @@index([configurationReleaseId])
  @@index([documentPolicyConfigVersionId])
  @@index([status, expiresAt])
  @@index([carId, pickupAt, returnAt])
}

model DocumentUploadIntent {
  id                            String @id @default(cuid())
  uploadSessionId               String
  documentPolicyConfigVersionId String
  documentTypeId                String
  side                          DocumentSide
  slotNumber                    Int
  attemptNumber                 Int
  idempotencyKey                String @unique @db.VarChar(128)
  filePolicyVersion             Int
  originalFileName              String?
  normalizedExtension           String @db.VarChar(16)
  declaredMimeType              String @db.VarChar(127)
  expectedSizeBytes             Int
  expectedChecksumSha256        String @db.Char(64)
  storageProviderId             String
  storageRegion                 String
  storageContainerId            String
  storageKey                    String
  providerUploadId              String?
  providerObjectVersionId       String?
  status                        DocumentUploadIntentStatus @default(INTENT_CREATED)
  revision                      Int @default(1)
  expiresAt                     DateTime
  cleanupEligibleAt             DateTime
  uploadCompletedAt             DateTime?
  verificationStartedAt         DateTime?
  completedAt                   DateTime?
  abortedAt                     DateTime?
  failureCode                   String? @db.VarChar(64)
  createdAt                     DateTime @default(now())
  updatedAt                     DateTime @updatedAt

  uploadSession       DocumentUploadSession @relation(fields: [uploadSessionId], references: [id], onDelete: Restrict)
  documentRequirement DocumentRequirementRule @relation(
    fields: [documentPolicyConfigVersionId, documentTypeId],
    references: [documentPolicyConfigVersionId, documentTypeId],
    onDelete: Restrict
  )
  customerDocument    CustomerDocument?

  @@unique([uploadSessionId, documentTypeId, side, slotNumber, attemptNumber])
  @@unique([storageProviderId, storageContainerId, storageKey])
  @@unique([storageProviderId, providerUploadId])
  @@index([uploadSessionId, status])
  @@index([status, expiresAt])
  @@index([status, cleanupEligibleAt])
  @@index([documentPolicyConfigVersionId, documentTypeId])
}
```

PostgreSQL permits multiple nulls in the nullable provider-upload unique key. The provider upload ID is treated as opaque. The browser never chooses release, policy, container, region, provider, key, expiry, checksum trust, slot validity, or acceptance state.

`filePolicyVersion` identifies the code-owned validation contract. Version 1 is proposed to mean PDF/JPEG/PNG candidate allowlist and 10,485,760-byte ceiling, but PDF production acceptance still depends on the approved structural validator decision in section 16.

## 6. Exact `CustomerDocument` proposal

All existing fields remain. The following is the complete proposed model shape with additions marked conceptually; it does not represent an applied edit.

```prisma
model CustomerDocument {
  id                            String @id @default(cuid())
  bookingId                     String?
  customerUserId                String
  uploadedById                  String
  documentTypeId                String
  side                          DocumentSide @default(SINGLE)
  sequence                      Int @default(1)
  storageProviderId             String
  storageRegion                 String
  storageKey                    String
  originalFileName              String?
  normalizedMimeType            String @db.VarChar(127)
  detectedMimeType              String? @db.VarChar(127)
  detectedFileType              String?
  fileExtension                 String? @db.VarChar(16)
  sizeBytes                     Int
  checksumSha256                String @db.Char(64)
  uploadStatus                  CustomerDocumentUploadStatus @default(PENDING)
  scanStatus                    MalwareScanStatus @default(PENDING)
  scanProviderReference         String?
  retentionUntil                DateTime
  legalHold                     Boolean @default(false)
  deletionStatus                DocumentDeletionStatus @default(RETAINED)
  deletedAt                     DateTime?
  deletionReason                String?
  createdAt                     DateTime @default(now())
  updatedAt                     DateTime @updatedAt

  evidenceSchemaVersion         Int @default(1)
  uploadSessionId               String?
  uploadIntentId                String? @unique
  configurationReleaseId        String?
  documentPolicyConfigVersionId String?
  documentRequirementTypeId     String?
  slotNumber                    Int?
  attemptNumber                 Int?
  isCurrent                     Boolean @default(true)
  replacesDocumentId            String?
  storageContainerId            String?
  storageObjectVersionId        String?
  declaredMimeType              String? @db.VarChar(127)
  filePolicyVersion             Int?
  quarantineStatus              DocumentQuarantineStatus?
  quarantinedAt                 DateTime?
  releasedFromQuarantineAt      DateTime?
  fileValidatorVersion          String?
  metadataVerifiedAt            DateTime?
  verificationFailureCode       String? @db.VarChar(64)
  scanAttemptCount              Int @default(0)
  scanRequestedAt               DateTime?
  scanCompletedAt               DateTime?
  scanResultCode                String? @db.VarChar(64)
  retentionBasis                DocumentRetentionBasis?
  retentionBasisAt              DateTime?
  retentionPolicyDaysSnapshot   Int?
  hardRetentionDaysSnapshot     Int?
  deletionEligibleAt            DateTime?

  booking              Booking? @relation(fields: [bookingId], references: [id], onDelete: Restrict)
  customer             User @relation("CustomerDocumentOwner", fields: [customerUserId], references: [id], onDelete: Restrict)
  uploadedBy           User @relation("CustomerDocumentUploader", fields: [uploadedById], references: [id], onDelete: Restrict)
  documentType         DocumentTypeDefinition @relation(fields: [documentTypeId], references: [id], onDelete: Restrict)
  uploadSession        DocumentUploadSession? @relation(fields: [uploadSessionId], references: [id], onDelete: Restrict)
  uploadIntent         DocumentUploadIntent? @relation(fields: [uploadIntentId], references: [id], onDelete: Restrict)
  configurationRelease BusinessConfigurationRelease? @relation(fields: [configurationReleaseId], references: [id], onDelete: Restrict)
  documentRequirement  DocumentRequirementRule? @relation(
    fields: [documentPolicyConfigVersionId, documentRequirementTypeId],
    references: [documentPolicyConfigVersionId, documentTypeId],
    onDelete: Restrict
  )
  replacesDocument     CustomerDocument? @relation("CustomerDocumentReplacement", fields: [replacesDocumentId], references: [id], onDelete: Restrict)
  replacementDocuments CustomerDocument[] @relation("CustomerDocumentReplacement")
  scanAttempts         DocumentMalwareScanAttempt[]
  legalHolds           DocumentLegalHold[]
  deletionRequests     DocumentDeletionRequest[]
  auditEvents          AuditEvent[]

  @@unique([storageProviderId, storageKey])
  @@unique([bookingId, documentTypeId, side, sequence])
  @@index([bookingId, documentTypeId])
  @@index([customerUserId, documentTypeId])
  @@index([retentionUntil, legalHold, deletionStatus])
  @@index([scanStatus, uploadStatus])
  @@index([deletionStatus, deletedAt])
  @@index([documentTypeId])
  @@index([uploadSessionId])
  @@index([configurationReleaseId])
  @@index([documentPolicyConfigVersionId, documentRequirementTypeId])
  @@index([replacesDocumentId])
  @@index([scanStatus, scanRequestedAt])
  @@index([legalHold, retentionUntil])
  @@index([deletionStatus, deletionEligibleAt])
}
```

For Phase 8 rows, `evidenceSchemaVersion = 2`. The service requires every nullable Phase 8 provenance/evidence field that is logically applicable. Version 1 preserves existing rows without fabricating facts.

The current `sequence` remains for compatibility and becomes the monotonically increasing attempt sequence for Phase 8. `slotNumber` is the policy slot. `attemptNumber` equals `sequence` for version 2. A replacement is a new row and new object key; no object is overwritten.

`documentRequirementTypeId` is a nullable relation scalar required only because the existing non-null `documentTypeId` already owns the preserved direct `DocumentTypeDefinition` relation. For version 2, a database trigger requires `documentRequirementTypeId = documentTypeId`; the compound FK then proves the exact policy/rule without removing or overlapping the existing type relation. Version 1 leaves it null.

## 7. Scan, legal-hold, and deletion evidence

### 7.1 Append-only malware scan attempts

```prisma
model DocumentMalwareScanAttempt {
  id                    String @id @default(cuid())
  customerDocumentId    String
  attemptNumber         Int
  scannerProviderId     String
  providerReference     String?
  providerEventId       String?
  startedAt             DateTime
  completedAt           DateTime
  outcome               MalwareScanStatus
  safeResultCode        String? @db.VarChar(64)
  retryable             Boolean
  sanitizedMetadata     Json?
  createdAt             DateTime @default(now())

  customerDocument CustomerDocument @relation(fields: [customerDocumentId], references: [id], onDelete: Restrict)

  @@unique([customerDocumentId, attemptNumber])
  @@unique([scannerProviderId, providerReference])
  @@unique([scannerProviderId, providerEventId])
  @@index([customerDocumentId, completedAt])
  @@index([outcome, completedAt])
  @@index([scannerProviderId, completedAt])
}
```

An attempt row is inserted only when a terminal provider result is normalized. It is never updated or deleted. Pending-request state remains typed on `CustomerDocument` through `scanStatus`, `scanAttemptCount`, `scanRequestedAt`, and the existing current provider reference. This preserves the provider reference needed before a callback while keeping completed attempt evidence genuinely append-only.

`sanitizedMetadata` is optional, schema-allowlisted, and limited to 4 KiB of JSON text by database check. It may contain bounded provider classification/version identifiers and safe reason codes. It cannot contain a raw report, signature database, malware sample, object key, filename, customer identifier, signed URL, credential, IP address, or user agent.

### 7.2 Legal-hold history

```prisma
model DocumentLegalHold {
  id                    String @id @default(cuid())
  customerDocumentId    String
  reason                String @db.Text
  appliedById           String
  appliedAt             DateTime @default(now())
  reviewAt              DateTime?
  expiresAt             DateTime?
  releasedById          String?
  releasedAt            DateTime?
  releaseReason         String? @db.Text
  revision              Int @default(1)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  customerDocument CustomerDocument @relation(fields: [customerDocumentId], references: [id], onDelete: Restrict)
  appliedBy        User @relation("DocumentLegalHoldAppliedBy", fields: [appliedById], references: [id], onDelete: Restrict)
  releasedBy       User? @relation("DocumentLegalHoldReleasedBy", fields: [releasedById], references: [id], onDelete: Restrict)

  @@index([customerDocumentId, appliedAt])
  @@index([reviewAt])
  @@index([expiresAt])
  @@index([appliedById, appliedAt])
  @@index([releasedById, releasedAt])
}
```

The active state is `releasedAt IS NULL`; expiry is a review/escalation deadline and never silently releases a hold. A partial unique index permits at most one active hold per document. Release atomically supplies `releasedById`, `releasedAt`, and `releaseReason`; a released row cannot be changed again. The existing `CustomerDocument.legalHold` remains a query summary and must equal existence of an active hold for version 2 rows.

### 7.3 Typed deletion request and append-only attempts

```prisma
model DocumentDeletionRequest {
  id                        String @id @default(cuid())
  customerDocumentId        String
  idempotencyKey            String @unique @db.VarChar(128)
  requestedById             String?
  reason                    String @db.Text
  eligibleAt                DateTime
  mustCompleteBy            DateTime
  status                    DocumentDeletionRequestStatus @default(SCHEDULED)
  revision                  Int @default(1)
  providerConfirmationRef   String?
  providerConfirmedAt       DateTime?
  lastFailureCode           String? @db.VarChar(64)
  completedAt               DateTime?
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt

  customerDocument CustomerDocument @relation(fields: [customerDocumentId], references: [id], onDelete: Restrict)
  requestedBy      User? @relation("DocumentDeletionRequestedBy", fields: [requestedById], references: [id], onDelete: Restrict)
  attempts         DocumentDeletionAttempt[]

  @@index([customerDocumentId, status])
  @@index([status, eligibleAt])
  @@index([status, mustCompleteBy])
  @@index([requestedById, createdAt])
}

model DocumentDeletionAttempt {
  id                       String @id @default(cuid())
  deletionRequestId        String
  attemptNumber            Int
  storageProviderId        String
  providerRequestId        String?
  startedAt                DateTime
  completedAt              DateTime
  outcome                  DocumentDeletionAttemptOutcome
  safeFailureCode          String? @db.VarChar(64)
  providerConfirmationRef  String?
  createdAt                DateTime @default(now())

  deletionRequest DocumentDeletionRequest @relation(fields: [deletionRequestId], references: [id], onDelete: Restrict)

  @@unique([deletionRequestId, attemptNumber])
  @@unique([storageProviderId, providerRequestId])
  @@index([deletionRequestId, completedAt])
  @@index([outcome, completedAt])
}
```

`requestedById` is nullable because automatic retention is a system action; manual deletion requires an actor. The reason is always mandatory and uses a safe code plus bounded explanation policy at the service boundary. The request is the mutable orchestration root. Each terminal provider call creates one immutable attempt row. `ALREADY_MISSING` is idempotent success, but an unexpectedly missing READY object also creates an incident audit marker.

The minimal tombstone is the existing `CustomerDocument` row plus completed request/attempt and append-only audit. It retains identifiers, type/provenance, hashes, byte count, lifecycle timestamps, deletion reason and provider confirmation—not bytes, URLs, credentials, full reports, or new copies of customer content.

## 8. Required inverse relations

The eventual Prisma edit must add these inverse fields; names are part of this proposal:

```prisma
model User {
  // existing fields
  documentUploadSessions       DocumentUploadSession[] @relation("DocumentUploadSessionCustomer")
  documentLegalHoldsApplied    DocumentLegalHold[] @relation("DocumentLegalHoldAppliedBy")
  documentLegalHoldsReleased   DocumentLegalHold[] @relation("DocumentLegalHoldReleasedBy")
  documentDeletionsRequested   DocumentDeletionRequest[] @relation("DocumentDeletionRequestedBy")
}

model Car {
  // existing fields
  documentUploadSessions DocumentUploadSession[]
}

model Booking {
  // existing fields
  documentUploadSession DocumentUploadSession?
}

model BusinessConfigurationRelease {
  // existing fields
  documentUploadSessions DocumentUploadSession[]
  customerDocuments      CustomerDocument[]
}

model DocumentTypeDefinition {
  // existing fields
  requirements DocumentRequirementRule[]
  documents    CustomerDocument[]
}
```

No new direct Booking field is required for release provenance because each document stores the exact release and is checked against the Booking pricing snapshot. The session’s unique nullable `bookingId` guarantees at most one consumed session per Booking.

## 9. Access and incident evidence

No `DocumentAccessToken`, signed-URL, or download-token table is proposed.

The existing append-only `AuditEvent` is sufficient for:

- metadata view and content-view authorization;
- signed-read issuance, including access kind, document ID, actor, policy/release IDs, object-version discriminator hash, issued/expiry times, recent-auth result, and safe request correlation;
- download initiation and safe provider-access correlation;
- access denial and reason code;
- hold/deletion/scan/quarantine state events and incident markers.

The event must never store the URL, object key, filename, credentials, customer identifiers beyond existing typed FKs, IP, user agent, content, or provider raw report. Application issuance is not proof that bytes were delivered; provider data events remain the evidence for actual object GET. The five-minute lifetime is a signing/policy invariant, not a database field on the document.

`AuditEvent.correlationId` plus bounded safe metadata is also sufficient to reference an external incident case. A second incident database would duplicate the security ledger and is not justified in Phase 8.

## 10. Restricted authorization proposal

Existing capability rows remain. Add only:

```text
documents.legal-hold.manage
```

Seed system roles without assigning any user:

| Role key | Capabilities | Policy flag additionally required |
|---|---|---|
| `DOCUMENT_REVIEWER` | `documents.view` | `mayView` |
| `DOCUMENT_DOWNLOADER` | `documents.view`, `documents.download` | `mayView`, `mayDownload` |
| `DOCUMENT_RETENTION_OPERATOR` | `documents.delete` | `mayDelete` |
| `DOCUMENT_LEGAL_HOLD_OFFICER` | `documents.legal-hold.manage` | `mayManageLegalHold` |

No role receives `roles.manage`. No user is auto-assigned. `ADMIN_COMPAT` is not accepted as an explicit sensitive-document role.

The current pure and database capability implementations automatically grant every capability to `User.role = ADMIN`, and the current `ADMIN_COMPAT` mapping contains all three existing document capabilities. Phase 8C must introduce a code-owned `RESTRICTED_DOCUMENT_CAPABILITIES` set and apply these rules in both paths:

1. the legacy `role === ADMIN` shortcut does not grant restricted document capabilities;
2. assignments through the `ADMIN_COMPAT` system role do not grant restricted document capabilities;
3. a dedicated active role assignment with the capability is required;
4. the exact release-bound `DocumentPolicyRolePermission` flag is also required;
5. recent authentication is required for download; legal hold never widens view/download;
6. direct route/service invocation performs the same fresh database checks.

The capability migration does not delete historical capability or role rows. The restricted resolver makes dormant compatibility mappings ineffective for these keys. Removing those mappings may be a later cleanup migration after all consumers use the restricted resolver; it is not required for Phase 8 schema integrity.

## 11. Lifecycle transitions and enforcement ownership

### 11.1 Upload session

Allowed transitions:

```text
OPEN -> CONSUMED
OPEN -> EXPIRED
OPEN -> ABORTED
```

All other transitions are rejected. `CONSUMED` requires a Booking, `consumedAt`, nonexpired clean required slots, and exact release/policy consistency. `EXPIRED` requires no Booking and expiration reached. `ABORTED` requires no Booking and `abortedAt`. Application orchestration locks the session and uses `revision`; a BEFORE UPDATE trigger enforces the transition and terminal immutability; checks enforce timestamp shapes.

### 11.2 Upload intent

Allowed primary path:

```text
INTENT_CREATED -> UPLOADING -> UPLOADED -> VERIFYING
VERIFYING -> QUARANTINED -> SCAN_PENDING -> CLEAN
```

Failure/cleanup paths:

```text
INTENT_CREATED | UPLOADING -> ABORTED | EXPIRED | FAILED
UPLOADED | VERIFYING | QUARANTINED | SCAN_PENDING -> REJECTED | FAILED
INTENT_CREATED | UPLOADING | UPLOADED -> EXPIRED when expiry/cleanup rules permit
```

`CLEAN`, `REJECTED`, `FAILED`, `ABORTED`, and `EXPIRED` are terminal. A retry is a new intent with a greater attempt number and a new object key. Application service controls provider calls; CHECK constraints enforce timestamps/ranges; trigger enforces transitions/terminal immutability; unique keys make duplicate completion idempotent.

### 11.3 Customer document and quarantine

For evidence version 2, a final row begins only after upload completion with `uploadStatus = UPLOADED`, explicit `QUARANTINED`, and exact intent provenance. Allowed document summary transitions:

```text
UPLOADED -> VERIFYING -> READY
UPLOADED | VERIFYING -> REJECTED | FAILED
```

`READY` requires successful metadata/signature validation, `scanStatus = CLEAN`, quarantine `RELEASED`, retained deletion state, current slot, and complete provenance. `REJECTED`/`FAILED` can never become READY; customer resubmission creates a replacement row.

After READY, object identity, ownership, provenance, type/side/slot, validation facts, checksum, byte count, and scan evidence are immutable. Only controlled current/replacement, retention, legal-hold summary, and deletion lifecycle fields may change. A quarantine move/copy may produce a new approved object key before READY; the intent retains the quarantine key and the final document retains the approved key, while provider/container, checksum, and typed intent lineage must agree.

Quarantine transitions:

```text
QUARANTINED -> RELEASED
QUARANTINED -> REJECTED
QUARANTINED | RELEASED | REJECTED -> DELETED
```

The database trigger rejects release unless scan is CLEAN and verification succeeded. Prefix names are not state authority.

### 11.4 Malware scan

Summary transitions:

```text
PENDING -> CLEAN | INFECTED | ERROR | TIMEOUT | UNSUPPORTED | PASSWORD_PROTECTED | FAILED
ERROR | TIMEOUT -> PENDING for a bounded retry
```

Each terminal result appends exactly one `DocumentMalwareScanAttempt`. Retry increments the summary attempt count before returning to PENDING. `NOT_AVAILABLE` is historical only. Provider event/reference uniqueness makes duplicate callbacks return the existing result.

### 11.5 Replacement

A replacement must have the same session, customer, document type, side, and logical slot; a greater attempt/sequence; a new intent and object key; and `replacesDocumentId` pointing to the immediately previous current row. In one transaction the service locks the prior row, marks it non-current, and inserts the successor. A deferred trigger prevents self-reference/cycles and validates chain equivalence. The partial unique current-slot index gives one winner under concurrent replacement.

### 11.6 Retention and legal hold

For a clean pre-booking object, the initial basis is `UPLOAD_SESSION_EXPIRY`. On Booking consumption, exact policy days and the 365-day hard maximum are snapshotted. Completion changes the basis to `RENTAL_COMPLETED` and calculates the absolute deadline from `Booking.completedAt`. Cancellation uses `BOOKING_CANCELLED`; rejection uses `REJECTED_UPLOAD`. Every controlled recalculation is audited.

Hold transitions are:

```text
no active hold -> active hold row
active hold row -> released row
released row -> immutable
```

A later independently authorized hold creates a new row. Only one can be active. A review/expiry timestamp alerts; it does not auto-release. A hold blocks scheduling and completion of deletion and does not change access permissions.

### 11.7 Deletion

Summary/request transitions:

```text
CustomerDocument: RETAINED -> SCHEDULED -> DELETED
                                     -> FAILED -> SCHEDULED
Request: SCHEDULED -> IN_PROGRESS -> COMPLETED
                                -> FAILED -> IN_PROGRESS
```

Scheduling requires no active hold, current time at/after eligibility, reason, idempotency key, and a seven-day `mustCompleteBy`. Each provider call appends a completed attempt. `DELETED` requires a successful `DELETED` or `ALREADY_MISSING` attempt and provider confirmation time. Completion clears current-slot occupancy, stores `deletedAt`, and retains only the tombstone/evidence. Terminal completed requests and attempt rows are immutable.

## 12. Exact database constraints, indexes, and triggers

### 12.1 CHECK constraints

Proposed SQL checks, generally introduced `NOT VALID` on existing tables and then validated:

- all `revision`, sequence, slot, attempt, file-policy, byte, and attempt-count values are positive;
- SHA-256 values match `^[0-9a-f]{64}$` for Phase 8 expected/final checksums;
- normalized extensions are lowercase `.pdf`, `.jpg`, `.jpeg`, or `.png`; declared/detected/normalized MIME values are from the code allowlist for evidence version 2;
- `expectedSizeBytes` and `sizeBytes` are between 1 and 10,485,760 for file policy version 1;
- pickup is before return; expiry is after creation; cleanup is at/after expiry;
- session terminal timestamps match status and are mutually consistent;
- intent terminal timestamps/failure code match status;
- `completedAt >= startedAt` for scan/deletion attempts;
- scan attempt outcome is terminal and not `PENDING` or `NOT_AVAILABLE`;
- safe codes match a bounded uppercase identifier pattern; sanitized JSON text is at most 4096 bytes;
- legal-hold reason is nonblank and bounded; release actor/time/reason are either all null or all non-null; review/expiry follows application time;
- deletion reason is nonblank and bounded; `mustCompleteBy >= eligibleAt`; completed request fields match status;
- Phase 8 retention days are positive, preference is at most hard maximum, and hard maximum is at most 365;
- Phase 8 `documentRequirementTypeId` equals the preserved `documentTypeId`;
- deleted summary fields and status agree.

Complex cross-row/release/Booking/lifecycle rules are not misrepresented as CHECK constraints.

### 12.2 Foreign keys

All evidence/provenance FKs use `ON DELETE RESTRICT`. Draft-only requirement translations retain the existing reviewed `ON DELETE CASCADE` to their draft/released policy parent and become immutable once released. No lifecycle/evidence row cascades away.

FKs added to populated `CustomerDocument` are nullable and should be created `NOT VALID`, then validated after the exact-evidence preflight. New-table FKs can be validated immediately.

### 12.3 Prisma-expressible uniqueness and indexes

The model blocks above define:

- session-to-Booking uniqueness;
- intent idempotency uniqueness;
- provider/container/key and nullable provider-upload uniqueness;
- logical intent attempt uniqueness;
- document-to-intent one-to-one uniqueness;
- per-document scan/deletion attempt uniqueness;
- provider scan reference/event and deletion request-reference uniqueness;
- cleanup, scan-pending, retention, hold-review, deletion-eligibility, provenance, and operational lookup indexes.

### 12.4 Custom partial indexes

```sql
CREATE UNIQUE INDEX "CustomerDocument_phase8_current_slot_key"
ON "CustomerDocument" (
  "uploadSessionId", "documentTypeId", "side", "slotNumber"
)
WHERE "evidenceSchemaVersion" >= 2
  AND "isCurrent" = true
  AND "deletionStatus" <> 'DELETED';

CREATE UNIQUE INDEX "DocumentLegalHold_one_active_key"
ON "DocumentLegalHold" ("customerDocumentId")
WHERE "releasedAt" IS NULL;

CREATE UNIQUE INDEX "DocumentDeletionRequest_one_open_key"
ON "DocumentDeletionRequest" ("customerDocumentId")
WHERE "status" <> 'COMPLETED';

CREATE INDEX "CustomerDocument_retention_due_idx"
ON "CustomerDocument" ("deletionEligibleAt", "id")
WHERE "deletionStatus" IN ('RETAINED', 'FAILED')
  AND "legalHold" = false;

CREATE INDEX "CustomerDocument_scan_pending_idx"
ON "CustomerDocument" ("scanRequestedAt", "id")
WHERE "scanStatus" = 'PENDING'
  AND "uploadStatus" = 'VERIFYING';

CREATE INDEX "DocumentLegalHold_review_due_idx"
ON "DocumentLegalHold" ("reviewAt", "id")
WHERE "releasedAt" IS NULL AND "reviewAt" IS NOT NULL;

CREATE INDEX "DocumentDeletionRequest_work_idx"
ON "DocumentDeletionRequest" ("eligibleAt", "id")
WHERE "status" IN ('SCHEDULED', 'FAILED');
```

Before the current-slot index, run a read-only duplicate preflight. No automatic deduplication is permitted.

### 12.5 Trigger responsibilities

Proposed PostgreSQL trigger functions:

1. `protect_released_document_policy_child()` extends current released-payload immutability to `DocumentRequirementTranslation` and the new policy fields/permission flag; new aggregate policy consistency applies only to document-policy schema version 2.
2. `enforce_document_upload_session_transition()` validates status transitions, exact release-to-policy equality, Booking customer/vehicle/date/release consistency, and terminal immutability.
3. `enforce_document_upload_intent_transition()` validates session/policy/rule/slot/side, provider-reference immutability, state transitions, terminal immutability, and expiry.
4. `enforce_phase8_customer_document_consistency()` is a DEFERRABLE constraint trigger validating requirement/type equality, intent/session/customer/release/policy/rule/Booking consistency, verification/scan/quarantine READY rules, post-READY evidence immutability, retention bounds, replacement equivalence/no cycle, and current-slot semantics.
5. `enforce_document_scan_attempt()` rejects nonterminal outcomes, validates attempt numbering and provider callback consistency, and prevents update/delete.
6. `enforce_document_legal_hold()` validates apply/release transition, capability-independent typed shape, terminal release immutability, and schedules deferred document summary/deletion checks.
7. `enforce_document_deletion_request_transition()` validates eligibility, absence of active hold, request transitions, idempotency, deadline, and completion evidence.
8. `protect_document_deletion_attempt()` validates attempt number/result and rejects update/delete.
9. `enforce_document_hold_deletion_consistency()` is deferred and guarantees the document hold summary equals the active hold and that no held document is scheduled/deleted.

Triggers do not call storage, scanner, authorization, or network services. They validate persisted facts only.

### 12.6 Restricted database permissions

Prisma alone does not guarantee append-only or least privilege. Before production:

- the runtime role receives only required table operations;
- direct UPDATE/DELETE on `AuditEvent`, `DocumentMalwareScanAttempt`, and `DocumentDeletionAttempt` is revoked;
- lifecycle mutation is limited to reviewed service transactions/functions or columns as deployment permits;
- migration/repair credentials are separate, short-lived, audited, and unavailable to the web process;
- no application role can disable triggers, alter policies, or read storage credentials/KMS material.

Database permissions are a production deployment gate, not a Prisma model feature.

## 13. Strictly additive migration sequence

No migration file exists in Phase 8B. After approval, generate six forward-only stages and review the produced SQL before running it even on disposable PostgreSQL.

### Stage 1 — Reference enums, policy contract, and upload sessions

Add:

- new enums and precise values on `MalwareScanStatus`;
- `identityDocumentChoice`, `showReminderInConfirmation`, and `mayManageLegalHold` with compatibility defaults;
- `DocumentRequirementTranslation`;
- `DocumentUploadSession` and `DocumentUploadIntent` with new-table indexes/FKs;
- required inverse Prisma relations.

Locks and deployment:

- enum additions take brief catalog locks;
- adding defaulted policy columns is metadata-only on supported PostgreSQL versions but still takes a brief `ACCESS EXCLUSIVE` table lock;
- new tables do not rewrite existing rows;
- ordinary indexes on empty new tables are immediate.

Backfill and compatibility:

- existing policies receive `DISABLED`, reminder `true`, and hold permission `false` only as neutral configuration defaults; they do not activate Documents or alter checkout;
- no translations, sessions, intents, or customer evidence are invented;
- old application binaries ignore the additions.

Recovery:

- before shared application, fix the unapplied migration and replay from empty;
- after application, retain the additive objects and use a forward correction; do not drop referenced rows.

### Stage 2 — Nullable final-document metadata and provenance

Add all proposed `CustomerDocument` fields, nullable except safe summaries/defaults: `evidenceSchemaVersion default 1`, `isCurrent default true`, and `scanAttemptCount default 0`. Add nullable FKs `NOT VALID` and basic `NOT VALID` checks. Add non-unique provenance/operational indexes.

Locks and deployment:

- `ALTER TABLE ADD COLUMN` and constraints require brief catalog/`ACCESS EXCLUSIVE` locks but no data rewrite for nullable/default-constant columns on supported PostgreSQL;
- `VALIDATE CONSTRAINT` uses a lighter lock and scans rows without blocking ordinary reads/writes in the same way as constraint creation;
- index strategy is chosen after a read-only row-count/lock preflight. Use ordinary indexes in a reviewed maintenance window for a small table, or a dedicated nontransactional `CREATE INDEX CONCURRENTLY` stage for a material table.

Backfill:

- every pre-Phase-8 row stays `evidenceSchemaVersion = 1`;
- new provenance, quarantine, verification, retention-basis, replacement, and provider-version fields remain null;
- no value is inferred from current release, filename, key, audit JSON, current policy, or Booking date;
- exact provider facts already present stay in their existing columns; they are not relabeled as newly verified evidence.

Application compatibility:

- pre-Phase-8 binaries continue to read/write the old columns;
- Phase 8C must not create version 2 rows until all required services and constraints are deployed;
- a feature gate keeps the Documents step unavailable during mixed-version deployment.

Recovery is forward-only after any version 2 row exists.

### Stage 3 — Scan and quarantine evidence

Add `DocumentMalwareScanAttempt`, checks, uniqueness, operational indexes, append-only trigger, quarantine/scan consistency trigger, and safe-metadata size constraint.

Locks/backfill:

- new table operations do not rewrite `CustomerDocument`;
- existing `scanStatus`/`scanProviderReference` are not converted into attempt rows because start/completion/provider-event evidence is absent;
- version 1 documents retain their current summary values.

Application compatibility:

- deployment may dual-write terminal attempts while the document workflow remains inaccessible;
- activation waits for callback idempotency and scan/quarantine constraints to pass synthetic tests.

### Stage 4 — Retention, legal hold, and deletion evidence

Add `DocumentLegalHold`, `DocumentDeletionRequest`, `DocumentDeletionAttempt`, FKs/indexes/checks, active/open partial indexes, append-only attempt trigger, and deferred hold/deletion consistency triggers.

Backfill:

- existing `legalHold = true` is not converted into a fabricated actor/reason/time record;
- existing deletion summary fields are not converted into provider-confirmed requests/attempts;
- such rows remain version 1 and are excluded from version 2 completeness checks;
- operations must review any legacy active hold/deletion row before Phase 8 production activation because the new worker cannot safely reinterpret it.

Application compatibility:

- old rows remain readable;
- workers process only version 2 rows with typed evidence;
- no retention/deletion worker is enabled in this migration stage.

### Stage 5 — Capability and role seed data

Idempotently add `documents.legal-hold.manage`, the four dedicated system roles, and the exact role-capability mappings from section 10. Add no user assignment. Do not add restricted document capabilities to `ADMIN_COMPAT`.

The current compatibility mappings are retained as historical rows, while Phase 8C restricted authorization deliberately ignores the legacy ADMIN shortcut and `ADMIN_COMPAT` for restricted document keys. Deployment order is:

1. ship resolver support for the restricted set with document endpoints still absent;
2. seed dedicated roles/capabilities;
3. assign named operational users through a separately authorized roles workflow;
4. enable document endpoints only after assignments/policy permissions and denial tests pass.

Rollback disables the feature/endpoints; it must not re-enable legacy ADMIN access.

### Stage 6 — Final triggers, partial indexes, and validated consistency

Add transition/deferred consistency functions, partial indexes, released-child immutability, and validated checks/FKs. Run read-only preflights first:

- duplicate current logical slots;
- invalid provider/idempotency references;
- orphan provenance/rule relations;
- malformed checksums/MIME/extension/size on version 2 rows;
- replacement cycles/mismatches;
- scan attempt gaps/duplicate callbacks;
- multiple active holds/open deletion requests;
- held scheduled/deleted rows;
- READY rows without clean/released/verified evidence;
- retention outside provisional 90/365-day rules.

There should be zero version 2 rows before the first deployment, making these checks deterministic. Do not repair a nonzero finding by deleting evidence. Investigate and forward-correct.

Custom partial indexes on populated tables should use `CONCURRENTLY` when preflight size/traffic warrants it. A failed concurrent build leaves an invalid index that must be dropped concurrently and retried; application behavior stays feature-gated until every index/constraint is valid.

## 14. Historical compatibility and mandatory new-document facts

### 14.1 Historical rows

Existing `CustomerDocument` rows remain valid with:

- `evidenceSchemaVersion = 1`;
- all new provenance/evidence fields null;
- current legacy upload, scan, retention, hold, and deletion summaries unchanged;
- no fabricated session, intent, rule, scan attempt, hold, deletion request, or provider confirmation.

Historical Bookings remain valid without documents or an upload session. Existing release and snapshot immutability is unchanged.

### 14.2 Required for every new active-release document

The Phase 8 application service requires for evidence version 2:

- authenticated active customer and uploader;
- typed open session with vehicle, dates, locale, expiry, exact active release and its exact document policy;
- exact rule/type/slot/side and monotonic attempt;
- unique intent/idempotency/provider/container/key and optional exact object version;
- file-policy version, normalized extension, declared/detected/normalized MIME, detected type/signature, positive bounded bytes, and verified lowercase SHA-256;
- metadata verifier version/time and explicit quarantine state;
- terminal append-only scan attempt with CLEAN summary before READY/Booking;
- provisional retention basis/deadline, followed by snapshotted policy/hard maximum on Booking binding;
- replacement/current semantics;
- typed hold/deletion evidence when those states apply.

Booking creation requires all active release rules to be satisfied by current READY documents owned by the same session/customer, then links the Booking and consumes the session inside the same serializable PostgreSQL transaction as the existing Booking snapshots and legal acceptances. Storage is not claimed to participate in that ACID transaction.

### 14.3 Backfill policy

Only exact, already-stored evidence may be copied. In the current data model there is no exact session, release-policy, verification, scan-attempt, hold-authority, or provider-deletion evidence to backfill. Therefore the planned migration performs no Phase 8 provenance backfill. If a future read-only preflight finds a possible relationship, it still remains null unless every required key and immutable release-backed fact agrees uniquely.

## 15. Provider-neutral persistence contract

The schema stores only provider-neutral values:

- provider key such as `aws-s3` or `local-private`;
- region such as `eu-central-1` or a local sentinel allowed only outside production;
- opaque container identifier;
- opaque object key;
- optional opaque object-version and upload identifiers;
- safe scanner provider/reference/event identifiers;
- normalized outcomes and safe codes.

It stores no AWS ARN, access key, secret, presigned URL, raw SDK response, bucket policy, KMS key material, scanner report, or object bytes. Domain/UI code will consume provider-neutral interfaces from the approved Phase 8A design. AWS S3/GuardDuty and local fake adapters map their SDK-specific values only at the infrastructure boundary.

Provider substitutions require a new adapter and production security review, not schema replacement, provided they can supply private regional storage, checksum/object identity, short-lived reads, exact deletion confirmation, and normalized scan outcomes.

## 16. Owner-decision classification

“Phase 8C” means application/domain/local-adapter implementation after this schema proposal and exact generated migration receive approval. “Production” means enabling real customer uploads or real provider resources. Provisional values may shape contracts/tests but are not final legal or go-live approval.

| # | Decision | Current classification | Schema effect | Required next gate |
|---:|---|---|---|---|
| 1 | Private provider: AWS S3 | **Provisionally approved** by architecture direction | Provider-neutral key/container/version columns | Real adapter/infrastructure approval before production; local Phase 8C can proceed. |
| 2 | EU region: `eu-central-1` Frankfurt | **Provisionally approved** | Region field and production validation contract | Infrastructure policy/health proof before production. |
| 3 | Customer-managed SSE-KMS | **Provisionally approved** | No key/credential column | KMS/IAM design and security approval before production. |
| 4 | Key-management responsibility | **Still blocking production**; architecture recommends security/operations, but no named owner exists | None | Name owner, break-glass/rotation/deletion authority before infrastructure provisioning. |
| 5 | GuardDuty Malware Protection for S3 | **Provisionally approved** | Normalized scan status/attempt/provider event | Real scanner adapter/event/DLQ approval before production; fake scanner Phase 8C can proceed. |
| 6 | Hybrid staged upload | **Approved for schema/Phase 8C** | Session/intent/quarantine models | Production presigning policy still requires infrastructure review. |
| 7 | Maximum size 10 MiB | **Provisionally approved** | Version-1 intent/document CHECK contract | Security/client confirmation before production; sufficient for Phase 8C synthetic validation. |
| 8 | PDF, JPEG, PNG | **Provisionally approved with PDF blocker** | Extension/MIME contract version | JPEG/PNG Phase 8C can proceed; PDF acceptance requires structural validator/CDR and data-location decision before implementation/production. |
| 9 | Maximum two files per type | **Provisionally approved from Phase 8A** | Existing 1–2 rule bound, slot uniqueness | Confirm document-specific front/back rules before policy activation; not a schema blocker. |
| 10 | Retention default 90 days after completion | **Provisionally approved; legal/client confirmation outstanding** | Policy preference and snapshot | Phase 8C may implement behind inactive feature; final confirmation blocks production activation. |
| 11 | Hard maximum 365 days | **Provisionally approved; legal/client confirmation outstanding** | CHECK/validation ceiling and snapshot | Final confirmation blocks production activation, not additive schema. |
| 12 | Seven-day deletion grace | **Provisionally approved** | `mustCompleteBy` contract | Operations/legal confirmation before worker production activation. |
| 13 | Dedicated hold capability and mandatory reason | **Approved for schema/Phase 8C** | Capability, permission flag, hold model | Named authorities/two-person indefinite-hold process blocks production. |
| 14 | Who may view | **Restricted boundary approved; assignees unresolved** | Dedicated role, exact policy flag | Name/assign reviewers before endpoint production enablement. Ordinary ADMIN remains denied. |
| 15 | Who may download | **Restricted boundary approved; assignees unresolved** | Dedicated narrower role, exact policy flag | Name/assign downloaders before endpoint production enablement. |
| 16 | Recent reauthentication | **Required, but duration still blocking download implementation** | No document-schema field | Approve 10/15/30-minute window before Phase 8C download endpoint; schema can proceed. |
| 17 | Signed read lifetime five minutes | **Provisionally approved** | Audit expiry evidence only; no URL column | Bucket-policy proof before production. Shorter runtime default remains permissible. |
| 18 | Customer download disabled initially | **Approved** | No customer-access table/role | Future enablement requires a separate authorization/privacy gate. |
| 19 | Backup/version deletion propagation | **Provisionally no content backup/versioning from Phase 8A; production confirmation required** | Optional object-version column retained | Backup/restore/erasure runbook blocks production storage activation. |
| 20 | Incident notification/evidence | **Still blocking production** | Audit correlation is sufficient | Name security/privacy/legal owners, evidence retention and escalation contacts before production. |
| 21 | Local adapter | **Approved for Phase 8C**: disposable mode-0700 filesystem/fake signer | `local-private` provider-neutral contract | Never production; cleanup proof required in tests. |
| 22 | Disposable integration tests | **Approved for Phase 8C**: PostgreSQL + temp private files + fake scanner, synthetic only | No special schema | Real provider sandbox tests required only before production provider enablement. |

### Decision summary by gate

- **Schema-blocking:** none remain if this proposal is approved. Nullable historical compatibility and provider-neutral fields cover outstanding operational choices.
- **Required before Phase 8C implementation:** exact schema/migration approval; recent-auth duration before implementing download; PDF validator decision before implementing PDF acceptance. Other Phase 8C work must remain local/fake and feature-disabled.
- **Infrastructure-provisioning blockers:** named key owner, reviewed S3/KMS/IAM/BPA design, GuardDuty/EventBridge/DLQ design, real cloud authorization, and credentials/secrets boundary.
- **Production-go-live blockers:** final 90/365/7-day legal/client retention approval; exact role assignees and policy mappings; incident owners/escalation; backup/version deletion behavior; DPA/TIA/subprocessor review; provider privacy/region/encryption/scanner health evidence; database permissions; operational monitoring/reconciliation.
- **Safely deferrable:** customer content access, content backup/versioning if explicitly choosing none, broader providers, OCR, identity verification, and later-stage required-document workflows. None may be silently enabled.

## 17. Phase 8C readiness checklist

Phase 8C may begin only after:

- [ ] owner approves every enum/model/field/relation in this document;
- [ ] owner approves the six-stage migration strategy and version-1/version-2 historical boundary;
- [ ] exact `schema.prisma` diff and generated SQL are reviewed at the next migration gate;
- [ ] no destructive statement, existing-column rename/type conversion, fabricated backfill, or `Car.price` change exists;
- [ ] complete migration replay and schema diff pass on disposable PostgreSQL with synthetic legacy rows;
- [ ] partial-index duplicate and exact-evidence preflights return zero unsafe rows;
- [ ] restricted capability behavior explicitly excludes legacy ADMIN and `ADMIN_COMPAT` for sensitive document keys;
- [ ] document endpoints remain absent/disabled during schema deployment;
- [ ] local fake storage/scanner and synthetic-only test boundary are maintained;
- [ ] recent-auth duration is approved before download endpoint work;
- [ ] PDF is either backed by an approved structural validator/CDR or kept unavailable despite its provisional policy listing;
- [ ] retention values are visibly marked provisional and cannot activate production workflow before legal/client confirmation.

Phase 8C scope after those gates is domain services, guarded lifecycle logic, policy administration, local/fake adapters, synthetic tests, and—only if separately authorized—the staged runtime work described in Phase 8A. AWS infrastructure is not implicitly authorized.

## 18. Exact approval checklist

Please approve or amend:

- [ ] new and extended enums in section 3;
- [ ] policy fields, identity-choice semantics, translations, and hold permission in section 4;
- [ ] `DocumentUploadSession` and `DocumentUploadIntent` in section 5;
- [ ] nullable evidence-versioned `CustomerDocument` additions in section 6;
- [ ] append-only terminal scan-attempt design in section 7.1;
- [ ] typed legal-hold apply/release history in section 7.2;
- [ ] typed deletion request plus append-only provider attempts in section 7.3;
- [ ] existing `AuditEvent` as sufficient access/incident evidence with no signed-token table;
- [ ] dedicated roles and `documents.legal-hold.manage`, with legacy ADMIN/`ADMIN_COMPAT` denied by the restricted resolver;
- [ ] exact state transitions and enforcement split in sections 11–12;
- [ ] partial indexes, deferred triggers, append-only controls, and restrictive FKs;
- [ ] six strictly additive migration stages, no historical fabrication, and forward-only recovery;
- [ ] application-mandatory evidence version 2 facts for every new active-release document;
- [ ] owner-decision classifications and remaining Phase 8C/production blockers;
- [ ] next authorization is **Phase 8C schema/migration application only** or a separately stated broader Phase 8C scope.

Until that approval, do not modify Prisma, create migrations, install provider/scanner dependencies, contact external services, or implement uploads/access/retention/deletion behavior.
