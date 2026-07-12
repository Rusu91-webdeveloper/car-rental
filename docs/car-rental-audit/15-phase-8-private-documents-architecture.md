# Phase 8A — Private customer documents architecture gate

Review date: 2026-07-13. Scope: architecture, schema sufficiency, provider/scanner options, security controls, migration proposal, and approval checklist only.

No Prisma file, migration, dependency, application behavior, database, object store, scanner, upload route, or cloud resource was changed or contacted during this review.

## 1. Executive decision

The existing Phase 2B document tables are a useful metadata foundation, but they are **not sufficient** for Phase 8 runtime integrity. Implementation must remain blocked until the owner approves:

- an additive schema extension for upload sessions/intents, exact release/policy provenance, quarantine/verification facts, scan attempts, replacement slots, retention basis, legal-hold authority, and deletion actors/outcomes;
- a production object-store provider, exact EU region, encryption/key owner, and backup/version-deletion behavior;
- a malware-scanning provider and event-delivery path;
- hard file/retention/access limits and the removal of automatic sensitive-document access from ordinary legacy administrators;
- the required production SDKs and infrastructure.

Recommended architecture:

- Amazon S3 private general-purpose bucket in `eu-central-1` (Frankfurt), with account/bucket Block Public Access, TLS, opaque keys, default SSE-KMS using a customer-managed symmetric KMS key, and no public/CDN delivery;
- GuardDuty Malware Protection for S3 on the quarantine prefix, object-result tagging enabled, and idempotent EventBridge result delivery;
- hybrid staged direct upload: typed server intent → private presigned upload to quarantine → provider metadata and checksum verification → signature/decoder validation → asynchronous malware scan → clean/rejected transition;
- required documents must be clean before Booking creation; Phase 8 must not invent `DOCUMENTS_PENDING` booking semantics;
- no ordinary `ADMIN` compatibility bypass for document content, download, deletion, or legal hold;
- 60-second signed reads (hard provider-policy ceiling five minutes), recent reauthentication for downloads, application audit on issuance, and provider data-event evidence for actual object access;
- JPEG/PNG initially; PDF remains conditional on an approved structural sanitizer/CDR path because malware scanning alone does not prove that a PDF has no active content;
- provisional recommendation of 10 MiB per file, at most two files per type, 30-day post-completion default retention, 90-day hard ceiling, and seven-day deletion grace. Retention values require owner and legal/privacy approval before code or schema enforcement.

This is security architecture, not a claim of automated GDPR or legal compliance.

## 2. Current deployment and code constraints

- The application is Next.js 16 and targets Vercel conventions. No worker platform, queue, infrastructure-as-code, `vercel.json`, or provider-specific private storage dependency exists.
- Server Actions currently allow an 8 MB body, which is smaller than the requested 10 MB candidate limit. A 10 MB server-proxied upload would therefore require a configuration increase and would still consume serverless memory, bandwidth, and execution time.
- The only upload integration is an admin-only Cloudinary signature route for public vehicle imagery. It permits a caller-selected folder and has no customer-document privacy, intent binding, signature sniffing, quarantine, scan, retention, or access-audit controls. It must not be reused.
- Authentication uses NextAuth JWT sessions with Google. No recent-reauthentication timestamp or forced reauthentication flow is currently exposed.
- The Documents workflow step is hard-coded unavailable and the Documents administration route is an honest placeholder.
- There are no AWS, Azure, GCP, file-signature, image-decoder, PDF-sanitization, or malware-scanner runtime dependencies.

## 3. Existing schema sufficiency audit

### 3.1 Facts already represented

`DocumentTypeDefinition` provides seeded, stable Identity Card, Passport, and Driving Licence identifiers without an arbitrary user-created type path.

`DocumentPolicyConfigVersion`, `DocumentRequirementRule`, and `DocumentPolicyRolePermission` already represent:

- a versioned policy attached to an atomic Business Configuration release;
- per-type required/optional/disabled mode;
- single versus front/back structure;
- file count and supported upload stage;
- retention preference;
- distinct view/download/delete flags per access role;
- immutable released configuration payloads.

`CustomerDocument` already represents:

- optional Booking and required customer/uploader relations;
- document type, side, and sequence;
- provider, region, opaque key, original filename;
- normalized and detected MIME/type/extension;
- positive size and SHA-256 checksum;
- independent upload, scan, legal-hold, deletion, and retention fields;
- storage/slot uniqueness and operational indexes.

`AuditEvent` is append-only and can safely record views, signed-access issuance, downloads, denials, scans, holds, and deletion transitions without creating a second audit system. It already supports actor, document, release, correlation, before/after summaries, and safe metadata.

Capabilities already exist for `documents.view`, `documents.download`, and `documents.delete`.

### 3.2 Blocking omissions

| Required fact | Current state | Gate result |
|---|---|---|
| Exact Business Configuration release and document-policy provenance | Absent on `CustomerDocument` | Add nullable historical fields; require them for all new Phase 8 records. |
| Exact configured requirement | Type relation exists, but no relation to the release-bound `DocumentRequirementRule` | Add composite optional relation using policy version plus document type. |
| Upload slot versus replacement attempt | One `sequence` field conflates the two | Add slot/attempt/current/replacement facts and a partial current-slot uniqueness constraint. |
| Pre-booking expected booking/customer context | `bookingId` is nullable and there is no typed draft/session | Add `DocumentUploadSession`, bound to customer, vehicle, dates, release, policy, and eventual Booking. |
| Upload intent, idempotency, expiry, abort, provider upload ID | Absent | Add `DocumentUploadIntent`. Audit JSON is not primary session state. |
| Browser-declared MIME and expected checksum/size | Only final normalized/detected fields exist | Persist declared/expected values on the intent; server/provider values remain authoritative. |
| Storage container and object version | Provider/region/key only | Add container identifier and optional provider object-version ID. |
| Explicit quarantine disposition and timestamps | Only upload/scan states; no authoritative quarantine fact | Add a closed quarantine state plus quarantined/released timestamps. Do not infer from key prefixes. |
| Metadata/signature validator provenance | No validator version/time/failure code | Add validator version, verification time, and safe failure code. |
| Scan provider identity, attempts, requested/completed time, normalized outcome | One provider reference and coarse enum | Add provider ID, attempt count/times/result code; extend existing scan enum instead of replacing it. |
| `ERROR`, `TIMEOUT`, `UNSUPPORTED`, `PASSWORD_PROTECTED` scan outcomes | Coarsely collapsed into `FAILED`/`NOT_AVAILABLE` | Add enum values; retain old values for compatibility. |
| Retention start event and snapshotted policy | Only absolute `retentionUntil` | Add basis, basis timestamp, snapshotted days, hard eligibility, and grace deadline. |
| Legal-hold reason, actor, time, review/expiry and release evidence | Only Boolean | Add typed fields and hold/release actor relations. |
| Deletion requester/actor/time, attempts, last safe error, provider confirmation | Only status, deletedAt, reason | Add requested/completed actors/times, attempts, error code, and provider-confirmed timestamp. |
| Identity card **or** passport alternative | Two independent requirement rows cannot express XOR/choice | Add a typed identity-choice field and requirement mode to the policy. |
| Localized customer instructions and confirmation reminder | Absent | Add typed requirement translations and a confirmation-reminder flag. |
| Legal-hold and policy-management capabilities | Absent | Add seeded capability keys; no capability schema change is needed. |
| Recent reauthentication | JWT flow does not expose a reliable application `auth_time` | Add a signed JWT claim/forced Google reauth flow after owner approval; no database field is required. |

### 3.3 Access evidence sufficiency

`AuditEvent` is sufficient as the append-only evidence store for:

- metadata view and authorized content view;
- signed-read issuance and download initiation;
- access denial, including a safe hashed/opaque requested identifier when no document exists;
- scan outcome and quarantine transition;
- deletion request/completion/failure;
- legal hold application/release;
- incident markers.

It must never contain file bytes, original image/text, signed URLs, credentials, full object keys, raw scanner reports, IP addresses, or user agents. State-changing facts such as the active legal hold, retention deadline, scan status, and deletion status must remain typed on `CustomerDocument`; AuditEvent cannot substitute for primary state.

### 3.4 Historical compatibility

- All new provenance/hold/scan/deletion fields on existing `CustomerDocument` rows remain nullable.
- Add `evidenceSchemaVersion Int @default(1)`; the Phase 8 service writes version 2 and database checks/triggers apply the new requirements to version 2 rows.
- Do not infer release, policy, requirement, hold actor, scan time, or deletion authority from current settings, filenames, object-key parsing, or audit metadata.
- Backfill only exact provider facts already present on a row; otherwise leave nullable.
- No existing Booking, legal acceptance, pricing, insurance, or customer/driver snapshot changes are proposed.

## 4. Additive Prisma proposal

This section is a proposal only. `prisma/schema.prisma` has not been modified.

### 4.1 Extend closed enums

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

enum IdentityDocumentChoice {
  DISABLED
  IDENTITY_CARD_ONLY
  PASSPORT_ONLY
  EITHER_IDENTITY_CARD_OR_PASSPORT
  BOTH
}
```

Existing enum values remain valid.

### 4.2 Document policy additions

```prisma
model DocumentPolicyConfigVersion {
  // existing fields
  identityDocumentChoice    IdentityDocumentChoice @default(DISABLED)
  identityRequirement       DocumentRequirementMode @default(DISABLED)
  showReminderInConfirmation Boolean @default(true)
  requirementTranslations   DocumentRequirementTranslation[]
}

model DocumentRequirementTranslation {
  id                            String @id @default(cuid())
  documentPolicyConfigVersionId String
  documentTypeId                String
  locale                        String @db.VarChar(10)
  instructions                  String @db.Text

  documentPolicyConfig DocumentPolicyConfigVersion @relation(... onDelete: Cascade)
  documentType         DocumentTypeDefinition      @relation(... onDelete: Restrict)

  @@unique([documentPolicyConfigVersionId, documentTypeId, locale])
  @@index([locale])
  @@index([documentTypeId, locale])
}
```

Validation requires normalized supported locales, plain text, bounded length, and consistency between identity choice and the Identity Card/Passport rule rows.

### 4.3 Pre-booking session and intent

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

  customer             User @relation(... onDelete: Restrict)
  car                  Car @relation(... onDelete: Restrict)
  configurationRelease BusinessConfigurationRelease @relation(... onDelete: Restrict)
  documentPolicy       DocumentPolicyConfigVersion @relation(... onDelete: Restrict)
  booking              Booking? @relation(... onDelete: Restrict)
  intents              DocumentUploadIntent[]

  @@index([customerUserId, status, expiresAt])
  @@index([configurationReleaseId])
  @@index([documentPolicyConfigVersionId])
  @@index([status, expiresAt])
}

model DocumentUploadIntent {
  id                    String @id @default(cuid())
  uploadSessionId       String
  documentTypeId        String
  side                  DocumentSide
  slotNumber            Int
  attemptNumber         Int
  idempotencyKey        String @unique
  originalFileName      String?
  normalizedFileName    String?
  declaredMimeType      String @db.VarChar(127)
  expectedSizeBytes     Int
  expectedChecksumSha256 String @db.Char(64)
  storageProviderId     String
  storageRegion         String
  storageContainerId    String
  storageKey            String
  providerUploadId      String?
  providerObjectVersionId String?
  status                DocumentUploadIntentStatus @default(INTENT_CREATED)
  revision              Int @default(1)
  expiresAt             DateTime
  uploadedAt            DateTime?
  verifiedAt            DateTime?
  abortedAt             DateTime?
  failureCode           String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  uploadSession DocumentUploadSession @relation(... onDelete: Restrict)
  documentType DocumentTypeDefinition @relation(... onDelete: Restrict)
  document     CustomerDocument?

  @@unique([uploadSessionId, documentTypeId, side, slotNumber, attemptNumber])
  @@unique([storageProviderId, storageContainerId, storageKey])
  @@index([uploadSessionId, status])
  @@index([status, expiresAt])
}
```

The browser never chooses provider/region/container/key/release/policy. Intent IDs and object keys use cryptographically random opaque values. The idempotency key is server-scoped and contains no customer data.

### 4.4 `CustomerDocument` additions

```prisma
model CustomerDocument {
  // existing fields remain
  evidenceSchemaVersion          Int @default(1)
  uploadIntentId                 String? @unique
  configurationReleaseId         String?
  documentPolicyConfigVersionId  String?
  slotNumber                     Int?
  attemptNumber                  Int?
  isCurrent                      Boolean @default(true)
  replacesDocumentId             String?
  storageContainerId             String?
  storageObjectVersionId         String?
  normalizedFileName             String?
  declaredMimeType               String? @db.VarChar(127)
  quarantineStatus               DocumentQuarantineStatus @default(QUARANTINED)
  quarantinedAt                  DateTime?
  releasedFromQuarantineAt       DateTime?
  validatorVersion               String?
  metadataVerifiedAt             DateTime?
  verificationFailureCode        String?
  scanProviderId                 String?
  scanAttemptCount               Int @default(0)
  scanRequestedAt                DateTime?
  scanCompletedAt                DateTime?
  scanResultCode                 String?
  retentionBasis                DocumentRetentionBasis?
  retentionBasisAt              DateTime?
  retentionPolicyDaysSnapshot   Int?
  deletionEligibleAt            DateTime?
  legalHoldReason               String?
  legalHoldAppliedById          String?
  legalHoldAppliedAt            DateTime?
  legalHoldReviewAt             DateTime?
  legalHoldReleasedById         String?
  legalHoldReleasedAt           DateTime?
  deletionRequestedById         String?
  deletionRequestedAt           DateTime?
  deletionCompletedById         String?
  providerDeletionConfirmedAt   DateTime?
  deletionAttemptCount          Int @default(0)
  deletionLastAttemptAt         DateTime?
  deletionFailureCode           String?

  uploadIntent         DocumentUploadIntent?
  configurationRelease BusinessConfigurationRelease? @relation(... onDelete: Restrict)
  documentPolicy       DocumentPolicyConfigVersion? @relation(... onDelete: Restrict)
  documentRequirement  DocumentRequirementRule? @relation(
    fields: [documentPolicyConfigVersionId, documentTypeId],
    references: [documentPolicyConfigVersionId, documentTypeId],
    onDelete: Restrict
  )
  replacesDocument     CustomerDocument? @relation("DocumentReplacement", ... onDelete: Restrict)
  replacementDocuments CustomerDocument[] @relation("DocumentReplacement")
  legalHoldAppliedBy   User? @relation("DocumentHoldAppliedBy", ... onDelete: Restrict)
  legalHoldReleasedBy  User? @relation("DocumentHoldReleasedBy", ... onDelete: Restrict)
  deletionRequestedBy  User? @relation("DocumentDeletionRequestedBy", ... onDelete: Restrict)
  deletionCompletedBy  User? @relation("DocumentDeletionCompletedBy", ... onDelete: Restrict)
}
```

Required inverse relations are added to User, Car, Booking, BusinessConfigurationRelease, DocumentPolicyConfigVersion, DocumentRequirementRule, and DocumentTypeDefinition.

A partial unique index enforces one current Phase 8 record per logical slot:

```sql
CREATE UNIQUE INDEX "CustomerDocument_current_slot_key"
ON "CustomerDocument" (
  "bookingId", "documentTypeId", side, "slotNumber"
)
WHERE "evidenceSchemaVersion" >= 2
  AND "isCurrent" = true
  AND "deletionStatus" <> 'DELETED';
```

Pre-booking uniqueness is enforced through the upload session/intent key. The existing `(bookingId, documentTypeId, side, sequence)` uniqueness remains untouched; the Phase 8 service assigns a monotonically increasing `sequence` per attempt and uses `slotNumber` for policy satisfaction.

### 4.5 Database protections

The migration should add, test, and defer where necessary:

- positive size/slot/attempt/revision/attempt-count checks;
- lowercase 64-character SHA-256 checks on expected/final checksums;
- normalized MIME/extension allowlist checks for evidence schema 2 rows;
- session date/expiry/status consistency;
- intent customer/release/policy/type/slot consistency;
- Phase 8 document provenance, Booking customer, and upload-session consistency;
- `READY` only when metadata is verified, scan is `CLEAN`, quarantine is released, and deletion is retained;
- infected/error/timeout/unsupported/password-protected files cannot become READY;
- legal hold requires reason, actor, timestamp and blocks scheduled/deleted transitions;
- DELETED requires provider confirmation and completion time;
- append-only audit and controlled state-transition triggers;
- released document policy children and translations remain immutable;
- new active releases with required documents require supported workflow and a valid security-readiness snapshot from application validation.

External provider health cannot be guaranteed by a PostgreSQL check. Activation must verify live provider privacy/region and scanner health immediately before release activation, while runtime must continue to fail closed if either dependency later becomes unavailable.

## 5. Storage-provider options

| Option | Security/operations | Cost | GDPR/data-location implications | Gate |
|---|---|---|---|---|
| **AWS S3 Frankfurt (`eu-central-1`) — recommended** | Strong bucket policy/IAM/KMS controls; GuardDuty S3 integration; EventBridge/CloudTrail. Existing Vercel app can use SDK/presigned POST. | Usage-based storage, requests, KMS, GuardDuty scan bytes, logs and egress. Moderate operational setup. | AWS documents that customers select the Region and that customer content generally remains in it under the DPA, subject to service/law exceptions. DPA/TIA/subprocessor review remains the controller’s responsibility. | Blocks production adapter and scanner implementation. |
| Azure Blob West Europe + Defender for Storage | Excellent managed on-upload scanning and Event Grid; CMK supported. Requires Azure identity/resource setup. | Blob, Key Vault, Defender scan and Event Grid/Log Analytics charges. | EU region available; owner must review Microsoft DPA/data-boundary and scanner-region availability. | Valid alternative; provider choice blocks implementation. |
| GCS Frankfurt (`europe-west3`) + custom scanner | Strong regional storage/CMEK. No equally direct managed storage malware pipeline identified in current repository; likely Cloud Run/third-party scanner. | Storage/KMS plus scanner compute/operations. Highest custom security ownership. | Regional bucket and CMEK controls available; owner still needs Google DPA/TIA review. | Not recommended for first implementation without an approved scanner. |
| Self-hosted/S3-compatible EU store | Maximum vendor/location control. Team owns hardening, durability, IAM, patching, monitoring, scanning and deletion verification. | Potentially lower raw storage, highest staffing/incident cost. | Can simplify geographic control but increases controller operational responsibility. | Defer unless an established platform team already operates it. |

Current official evidence:

- AWS lists `eu-central-1` as Europe (Frankfurt), Germany, with three Availability Zones: <https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html>.
- S3 Block Public Access provides centralized account/bucket controls: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html>.
- S3 supports customer-managed SSE-KMS keys and CloudTrail key-use auditing: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html>.
- AWS describes selected-Region controls and its DPA/SCC position: <https://docs.aws.amazon.com/whitepapers/latest/navigating-gdpr-compliance/in-summary.html>.

## 6. Encryption and key management

Options:

1. SSE-S3: least cost/operations, weaker customer control and key-use separation.
2. AWS-managed KMS key: KMS auditability but limited key-policy/rotation control.
3. **Customer-managed symmetric KMS key — recommended**: dedicated key policy, separate uploader/scanner/reader/deleter roles, rotation, disable/revocation capability, CloudTrail evidence, S3 Bucket Keys to reduce KMS request cost.
4. Client-side encryption: strongest separation but blocks managed scanning unless a trusted decrypting scanner receives keys; not recommended for this first pipeline.

Security/operations owns the KMS key, role policies, rotation, break-glass recovery, and deletion schedule; application developers receive no raw key material. GuardDuty documentation supports scanning SSE-KMS objects when the service role has the narrowly required KMS permissions: <https://docs.aws.amazon.com/guardduty/latest/ug/malware-protection-s3-iam-policy-prerequisite.html>.

## 7. Malware-scanner options and abstraction

### Recommendation

Use GuardDuty Malware Protection for S3 on the quarantine prefix with tagging enabled. It scans S3 object-created events, publishes results through EventBridge, supports result values including clean, threats found, unsupported, access denied and failed, and uses at-least-once delivery. The application must therefore deduplicate by provider event ID plus object version/checksum. AWS states that scanning occurs in an isolated same-Region environment and the temporary scan copy is deleted afterward: <https://docs.aws.amazon.com/guardduty/latest/ug/how-malware-protection-for-s3-gdu-works.html>.

Alternatives:

- Azure Defender for Storage: strong managed option if Azure Blob is selected; supports on-upload events and CMK-encrypted blobs, but region/feature availability must be rechecked: <https://learn.microsoft.com/en-us/azure/defender-for-cloud/introduction-malware-scanning>.
- ClamAV in Lambda/container: deterministic local/fake compatibility and lower provider lock-in, but the owner assumes signature updates, scaling, decompression limits, sandboxing, availability and incident response. Suitable only for development tests unless operations accepts it.
- Commercial scanning/CDR API: may support PDF sanitization and password/active-content policies, but adds a subprocessor, data-transfer, contract, regional-processing and availability decision.

### Provider-neutral scanner contract

```ts
interface MalwareScanner {
  readonly key: string
  verifyConfiguration(): Promise<ScannerHealth>
  requestScan(object: PrivateObjectReference, idempotencyKey: string): Promise<ScanRequest>
  verifyAndNormalizeEvent(request: Request): Promise<NormalizedScanEvent>
  getResult(reference: ScanReference): Promise<NormalizedScanResult | undefined>
}
```

Normalized outcomes are CLEAN, INFECTED, ERROR, TIMEOUT, UNSUPPORTED, and PASSWORD_PROTECTED. Provider findings/raw reports never enter ordinary UI, logs, audit JSON, or customer errors.

## 8. Private object-store abstraction

```ts
interface PrivateObjectStore {
  readonly key: string
  verifyConfiguration(): Promise<StorageHealth> // region, private access, encryption
  createUploadIntent(input: BoundUploadRequest): Promise<ProviderUploadIntent>
  inspectObjectMetadata(ref: PrivateObjectReference): Promise<ObjectMetadata>
  readVerificationRange(ref: PrivateObjectReference, maximumBytes: number): Promise<Uint8Array>
  createShortLivedReadAccess(input: AuthorizedReadRequest): Promise<ExpiringReadAccess>
  objectExists(ref: PrivateObjectReference): Promise<boolean>
  releaseFromQuarantine(ref: PrivateObjectReference): Promise<PrivateObjectReference>
  rejectQuarantinedObject(ref: PrivateObjectReference): Promise<void>
  deleteObject(ref: PrivateObjectReference, options: { allVersions: boolean }): Promise<DeleteResult>
  abortUpload(intent: ProviderUploadIntent): Promise<void>
}
```

Domain/UI code sees only provider key, region, container identifier, opaque key, and optional opaque version ID. It never sees SDK response types, credentials, KMS ARNs, internal URLs, or bucket policies.

Production object rules:

- random opaque keys without customer, booking, filename, email, document type, or date;
- separate quarantine and approved prefixes or buckets, but explicit database state remains authoritative;
- block all public ACL/policy paths and deny unencrypted/wrong-region/wrong-key writes;
- signed upload conditions bind exact key, maximum size, checksum and required encryption headers;
- no overwrite: every retry receives a new key;
- no CDN or public website configuration;
- no signed URL persisted anywhere.

## 9. Upload architecture and lifecycle

### Architecture comparison

| Pattern | Assessment |
|---|---|
| Server-proxied | Strong policy boundary, but current 8 MB action limit conflicts with the 10 MB recommendation and serverless bandwidth/memory/time costs are unnecessary. Use only for small verification reads and authorized downloads where operationally acceptable. |
| Private presigned direct upload | Scalable, but unsafe without typed session/intent binding, post-upload HEAD/checksum verification, expiry, cleanup and scan gating. |
| **Hybrid staged upload — recommended** | Presigned upload handles bytes; the server owns intent, metadata verification, state transitions, scanner events, booking binding and cleanup. |

### State machine

```text
OPEN SESSION
  → INTENT_CREATED
  → UPLOADING
  → UPLOADED
  → VERIFYING
  → QUARANTINED / SCAN_PENDING
      → CLEAN → quarantine RELEASED → READY
      → INFECTED / UNSUPPORTED / PASSWORD_PROTECTED → REJECTED
      → ERROR / TIMEOUT → bounded retry → FAILED
  → replacement creates a new attempt; old row becomes non-current
  → SCHEDULED deletion → provider confirmation → DELETED tombstone
```

Only server services transition state. Updates use revision predicates and database transition checks. Duplicate completion and scan events return the already-known state. Conflicting checksum/object version events fail closed and create an incident-safe audit marker.

### Saga and failure handling

- **Intent row created, upload fails:** intent expires; cleanup aborts multipart/provider upload; no `CustomerDocument` is accepted.
- **Object uploaded, metadata transaction fails:** object remains in quarantine; reconciliation finds provider object by exact intent key and either retries persistence or deletes after expiry.
- **Scanner timeout/error:** never READY; bounded retry with exponential delay and attempt ceiling; customer receives a safe replacement/retry state.
- **Infected/unsupported/password-protected:** remains inaccessible and rejected; retain in isolated quarantine only for the approved incident window, then delete unless an authorized incident hold exists.
- **Booking creation fails after clean upload:** clean pre-booking documents remain bound to the still-open session until short expiry so the customer can retry. They are never reassigned to another customer or release.
- **Abandoned upload/session:** expire and delete objects idempotently after the approved 24-hour candidate window.
- **Duplicate completion/callback/deletion:** idempotency keys, provider object version/checksum, revisions, and terminal-state checks return the prior result.
- **Provider outage:** fail closed, keep quarantine state, surface health blocker, retry bounded background work, and never create a required-document Booking.

### Booking binding

1. Server creates a session for the authenticated customer, exact vehicle/dates, active release, and exact document policy.
2. Server resolves required logical slots, including Identity Card-or-Passport choice.
3. Customer uploads and replaces only within those slots.
4. Booking creation locks the vehicle and re-resolves the active release.
5. In the existing serializable PostgreSQL transaction, it verifies session owner/request/release/policy, current clean slots, checksums, and non-expiry.
6. It creates Booking and existing snapshots, links the exact document rows to Booking/release/policy/requirement, and marks the session CONSUMED.
7. If the database transaction fails, object state is unchanged and the session can be safely retried or later expired.

No cross-system ACID claim is made.

For Phase 8, required rules should support `DURING_BOOKING` only. `AFTER_REQUEST` and `BEFORE_PICKUP` required modes imply a new pending/compliance Booking lifecycle and must remain activation blockers until separately designed.

## 10. File validation policy

Non-configurable validation sequence:

1. Normalize basename for display only; reject path separators, control characters, double extensions, hidden suffixes, and disallowed extension.
2. Enforce nonzero size and owner-approved hard byte limit before signing and again from provider metadata.
3. Bind/check browser-declared MIME but never trust it.
4. Verify provider SHA-256/size/object version against the signed intent.
5. Read bounded signature bytes and detect the real type.
6. Fully decode allowed images with pixel/dimension/decompression limits; re-encode to a metadata-stripped approved object if that transformation is approved.
7. Scan asynchronously; no content access until CLEAN.
8. For PDF, reject encryption, JavaScript/actions, embedded files, forms/launch actions, malformed cross-reference structures and unsupported features through a vetted sanitizer/CDR. Malware scan alone is insufficient.

Recommended launch allowlist:

- JPEG (`FF D8 FF`) and PNG (valid PNG signature/decoder) — approve for Phase 8B;
- PDF — defer until the owner approves a structural validator/CDR and its subprocessor/data-location impact.

Always reject SVG, HTML/XML, JavaScript, Office files/macros, executables, archives, unknown binaries, mismatches, polyglots, empty files and decompression bombs. OCR is out of scope.

## 11. Authorization and signed access

### Required decision: remove blanket ADMIN document-content compatibility

Today both pure and database capability checks automatically grant every capability to `User.role = ADMIN`, and `ADMIN_COMPAT` contains view/download/delete. That conflicts with the Phase 8 default that ordinary admins cannot access identity documents.

Recommended sensitive-document rule:

- legacy ADMIN compatibility remains for general administration and configuration;
- `documents.view`, `documents.download`, `documents.delete`, and new `documents.legal-hold.manage` require an explicit active AccessRole assignment; the enum ADMIN shortcut must not satisfy them;
- policy permission and capability are both required: capability **AND** at least one assigned role with the exact release-bound policy flag;
- create system roles with no automatic users: `DOCUMENT_REVIEWER`, `DOCUMENT_DOWNLOADER`, `DOCUMENT_RETENTION_OPERATOR`, `DOCUMENT_LEGAL_HOLD_OFFICER`, and `DOCUMENT_POLICY_MANAGER`;
- prevent self-assignment and preserve last role manager controls through the existing roles-management boundary.

### Access checks

Every list/view/download/delete/hold request verifies:

- authenticated active user and current database capabilities;
- exact document exists and is current/not deleted;
- exact release-policy role permission;
- READY + CLEAN + released quarantine state for content access;
- recent reauthentication for download;
- no incident-wide access suspension;
- customer ownership only if customer access is later approved.

List projections expose type, side, status, scan status, upload date, retention deadline, hold state and masked filename only. They never expose provider, region, container, key, version, checksum, scanner reference or URL.

### Signed-read design

- Default expiry: 60 seconds; hard bucket-policy `s3:signatureAge` ceiling: five minutes.
- The application authorizes and writes `document.signed_read_issued` before returning the URL; the URL is never logged or persisted.
- Downloads require a signed JWT `authTime` no older than the approved window (recommended ten minutes). Otherwise force Google reauthentication with a safe return URL.
- Response headers force the approved filename and attachment/inline disposition, with `nosniff` and restrictive cache headers.
- Provider CloudTrail S3 data events record actual object GETs. Application audit records issuance/initiation and must not mislabel it as confirmed byte delivery.
- A leaked URL remains a bearer token until expiry; incident response can deny reads through bucket policy/KMS/IAM and rotate credentials, but cannot retract an already downloaded file.

AWS documents presigned URLs as bearer tokens and supports policy limits using `s3:signatureAge`: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html>.

Customer access defaults to metadata/status only, not document content or download.

## 12. Retention, legal hold, and deletion

### Retention model

- Pre-booking session: provisional deletion deadline based on upload/session expiry.
- Consumed booking: exact policy days are snapshotted; final basis is rental completion.
- Completion: set absolute `retentionUntil = completedAt + policyDays`, capped by the hard ceiling measured from completion.
- Cancellation: shorten to the approved cancellation window; never extend beyond the existing hard ceiling.
- Date changes before completion: recompute provisional deadline from the new rental end, audit the change, and never exceed the snapshotted hard ceiling.
- Rejected/infected objects: use the much shorter incident-quarantine deadline.
- Booking never completes: operations policy must select cancellation/abandonment handling; no indefinite retention.

Recommended values requiring explicit approval: 30-day default after completion, 90-day hard maximum, seven-day grace for deletion retries, 24-hour abandoned upload cleanup, and at most 24 hours of infected-object quarantine unless an authorized incident hold applies.

### Legal hold

- Requires explicit `documents.legal-hold.manage`, reason, actor, application timestamp, review/expiry date, and append-only audit event.
- Does not change view/download permissions.
- Blocks scheduling and completion of deletion.
- Release requires the same capability, actor/time, audit, and a recomputed immediate deletion eligibility check.
- Concurrent apply/release uses revision checks and one winner.
- Ordinary ADMIN compatibility does not grant hold authority.
- An indefinite hold requires a separately identified legal/incident authority and recurring review; no dashboard default creates one.

### Idempotent staged deletion

1. Transactionally set deletion SCHEDULED, requester/time/reason, after verifying no hold.
2. Worker deletes the exact provider object/version; if versioning is used, delete all object versions and markers.
3. Verify absence/provider confirmation.
4. Mark DELETED with completion actor/time and retain only metadata tombstone/audit evidence.
5. Missing provider object is a successful idempotent delete only after recording `OBJECT_ALREADY_MISSING`; an unexpected missing READY object also creates an incident marker.
6. Provider failure records a safe code, increments attempts, and retries within grace; after grace, health/operations alerts remain active.

Recommendation: disable bucket versioning because every upload uses a unique opaque key and versioning materially complicates erasure. If versioning is approved, object version ID becomes mandatory and deletion must permanently remove all versions. S3 documentation confirms that a simple delete in a versioned bucket creates a delete marker rather than permanently deleting prior versions: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html>.

Do not create independent content backups by default. Rely on regional S3 durability and database metadata backups. If policy mandates content backup, it must be encrypted in an approved EU region, inherit holds, accept deletion tombstones, and prove deletion propagation within the approved SLA.

## 13. Health and release integration

Phase 8B health checks:

- `DOCUMENT_STORAGE_NOT_CONFIGURED`
- `DOCUMENT_STORAGE_REGION_INVALID`
- `DOCUMENT_SCANNER_NOT_CONFIGURED`
- `DOCUMENT_POLICY_MISSING`
- `DOCUMENT_TYPE_UNAVAILABLE`
- `DOCUMENT_RETENTION_INVALID`
- `DOCUMENT_ACCESS_POLICY_INVALID`
- `DOCUMENT_WORKFLOW_CONFLICT`
- `DOCUMENT_SECURITY_NOT_READY`
- `DOCUMENT_READY`

Activation prerequisites:

- exact document-policy version is validated and referenced;
- every enabled type and required locale has valid rules/instructions;
- required stage is implemented;
- Documents workflow mode matches policy;
- provider reports private access, exact approved region, encryption and container;
- scanner reports operational and compatible with encryption/type limits;
- retention lies within owner-approved system bounds;
- at least one explicitly assigned view role exists only when operational review is required; no broad ADMIN fallback;
- current health is rechecked immediately inside activation orchestration.

If storage or scanner later fails, runtime fails closed and required-document Booking creation stops; the active release is not silently bypassed.

### 13.1 Document-policy administration boundary

After approval, `/admin/business-configuration/documents` may configure only business rules inside code-enforced security ceilings:

- enabled Identity Card, Passport, and Driving Licence definitions; required/optional mode; Identity Card-or-Passport choice; front/back structure; supported upload timing; localized plain-text instructions; and the approved confirmation reminder;
- maximum files per type and retention preference only within the owner-approved hard limits;
- explicit roles permitted to view or download, with validation rejecting broad legacy-ADMIN fallback and invalid/missing operational assignments;
- draft/edit/validate/attach/release behavior through the existing immutable Business Configuration workflow.

The UI cannot select a provider path or region, make an object public, enable a new MIME type, increase the system byte/count ceiling, disable scanning or authorization, suppress sensitive-access audit, exceed the retention ceiling, or create an indefinite hold. Released policy values remain immutable. The customer-facing checkout resolves the exact active release and policy server-side and renders only snapshotted supported instructions; browser input never supplies provenance or security state.

## 14. Audit vocabulary

Safe actions should include:

- `document_policy.draft_created`, `.changed`, `.validated`, `.attached`;
- `document.upload_session_created`, `.intent_created`, `.uploaded`, `.metadata_verified`, `.aborted`, `.expired`;
- `document.scan_requested`, `.clean`, `.infected`, `.failed`;
- `document.quarantine_released`, `.rejected`;
- `document.metadata_viewed`, `.content_view_authorized`, `.signed_read_issued`, `.download_initiated`, `.access_denied`;
- `document.retention_calculated`;
- `document.legal_hold_applied`, `.released`;
- `document.deletion_requested`, `.completed`, `.failed`;
- `document.incident_marked`.

Audit metadata uses document/release/policy IDs, status codes, role IDs, safe reason codes, byte counts, attempts, and correlation IDs. It excludes bytes, content, original unmasked filename, signed URL, credential, KMS key, full object key, raw provider/scanner report, IP and user agent.

## 15. Incident runbook

### Common first response

1. Declare severity/incident owner and preserve append-only application/provider/IAM/KMS audit evidence.
2. Fail closed: suspend signed-read issuance and, if required, new uploads/bookings without making existing files public.
3. Contain with IAM/bucket/KMS policy, credential/session revocation, access-role removal, and quarantine transition.
4. Do not delete suspected evidence until authorized incident/legal-hold review.
5. Escalate to privacy/legal/security owners to assess notification duties; the application does not automate legal conclusions.
6. Correct configuration, rotate credentials/keys where indicated, verify region/private/encryption/scanner health, and document post-incident actions.

### Scenario actions

| Scenario | Containment and evidence |
|---|---|
| Unauthorized access | Revoke role/session, disable signed reads, inspect app audit plus S3/KMS data events, apply incident hold to affected records, assess scope/notification. |
| Leaked signed URL | Deny object/prefix or reader role, wait for/reduce URL ceiling, rotate signing credentials if compromised, review provider GET events. A completed download cannot be revoked. |
| Incorrect capability assignment | Remove assignment, invalidate active sessions, enumerate accesses during assignment window, preserve role-change audit, review assignment controls. |
| Infected file accepted | Immediately quarantine/deny object, halt clean transition worker, rescan affected checksum/time window, investigate callback validation and scanner health, notify security/privacy owners. |
| Region misconfiguration | Stop uploads/reads, prevent activation, inventory affected provider object versions, preserve evidence, obtain privacy/legal transfer assessment before controlled relocation/deletion. |
| Retention deletion failure | Keep SCHEDULED/FAILED state and access denied, retry bounded, alert after grace, verify exact versions/backups, document provider response. |
| Provider breach notice | Follow provider incident channel/DPA, restrict credentials, review CloudTrail/KMS/access logs, preserve affected-object inventory, invoke notification escalation. |
| Checksum mismatch/polyglot | Reject and isolate, never scan-promote, compare intent/provider/computed hashes, inspect signer/retry path, create incident marker for repeated attempts. |
| Missing READY object | Revoke access, mark incident rather than silently DELETED, inspect lifecycle/deletion/provider logs and any backup policy, provide safe customer replacement flow. |
| Audit anomaly | Protect audit database/credentials, compare provider data events, preserve exports, investigate append-only trigger/privileged-role usage and correct forward. |

## 16. Owner decisions

“Blocks” means Phase 8B production implementation/activation cannot safely proceed without an answer. GDPR notes are architectural considerations, not legal advice.

| # | Decision and options | Recommended default | Security / operational cost / GDPR | Blocks? / defer? |
|---:|---|---|---|---|
| 1 | Storage: AWS S3, Azure Blob, GCS, self-hosted | AWS S3 | Best scanner integration; moderate cloud/IAM cost; DPA/TIA review required | **Blocks** adapter. |
| 2 | EU region: Frankfurt, Ireland, Paris, another approved EU region | AWS `eu-central-1` Frankfurt | German region, no replication; possibly higher than broad multi-region; document selected-region exceptions | **Blocks** infrastructure/schema validation. |
| 3 | Encryption: SSE-S3, AWS-managed KMS, customer-managed KMS, client-side | SSE-KMS customer-managed key | Strong separation/audit; KMS requests/policy operations; no client-side encryption because managed scanner needs decrypt | **Blocks** bucket/scanner policy. |
| 4 | Key owner: provider defaults, application team, security/operations | Security/operations | Least privilege, rotation and break-glass overhead; supports accountability | **Blocks** production access roles. |
| 5 | Scanner: GuardDuty, Azure Defender, self-managed ClamAV, commercial CDR | GuardDuty for S3 | Managed signatures/scale; scan-byte/EventBridge cost; DPA/service review | **Blocks** scan adapter. |
| 6 | Upload: proxy, presigned direct, hybrid staged | Hybrid staged | Safest scalable fit for 8 MB Next limit; more state/reconciliation code | **Blocks** session model/API. |
| 7 | Max size: 5, 10, 20 MiB | 10 MiB | Limits abuse/cost while usable for photos; record data-minimization rationale | **Blocks** checks/signing. |
| 8 | Formats: JPEG/PNG; add PDF; broader | JPEG/PNG first; PDF only with approved sanitizer/CDR | Images are easier to decode/re-encode; PDF adds active-content/subprocessor risk | **Blocks** validator; PDF may defer. |
| 9 | Max files/type: 1, 2, policy-defined under hard ceiling | 2 | Supports front/back; bounded storage/attack surface | **Blocks** hard constraint. |
| 10 | Retention default: 7/30/90 days after completion | 30 days | Data minimization vs operational claims; legal basis/counsel review | **Blocks** calculation. |
| 11 | Hard maximum: 30/90/365 days | 90 days | Prevents indefinite admin choice; legal obligations may require a reviewed exception | **Blocks** schema/check. |
| 12 | Deletion grace: immediate/3/7/30 days | 7 days | Allows provider retry, not a user-access grace; files remain inaccessible | **Blocks** worker policy. |
| 13 | Hold authority: all admins, dedicated role, two-person process | Dedicated legal-hold role; two-person approval for indefinite holds | Prevents retention abuse; operational review overhead | **Blocks** capability/fields. |
| 14 | Viewers: all admins, explicit reviewer roles, no one | Explicit `DOCUMENT_REVIEWER` only | Least privilege; staffing/role admin cost | **Blocks** authorization. |
| 15 | Downloaders: viewers, narrower role, prohibited | Narrow `DOCUMENT_DOWNLOADER` | Download raises exfiltration risk; recent-auth/audit overhead | **Blocks** endpoint. |
| 16 | Recent reauth: none, 10/15/30 minutes | 10 minutes for download | Reduces stolen-session risk; OAuth UX and JWT claim work | **Blocks** download; view can defer. |
| 17 | Signed lifetime: 60 sec, 2 min, 5 min | 60 sec; hard ceiling 5 min | Lower leak window; clock/latency failures if too short | **Blocks** bucket/access policy. |
| 18 | Customer access: none, metadata/status, view, download | Metadata/status only | Minimizes exposure; GDPR access requests handled through controlled process | Content access can safely defer. |
| 19 | Backup/versioning: none, S3 versioning, separate EU backup | No content backup/versioning; regional durability only | Simplest verified deletion; owner accepts recovery tradeoff | **Blocks** deletion contract. |
| 20 | Incident notification/evidence: informal, documented security/privacy escalation, automated legal notice | Documented security/privacy escalation; manual legal decision | Required operational ownership; incident tooling cost | Runbook owner **blocks** go-live. |
| 21 | Local adapter: OS temp filesystem, MinIO, LocalStack | Mode-0700 disposable temp filesystem + fake signer | No public path/credentials; minimal dev cost; never production | Does not block production provider decision, but blocks tests. |
| 22 | Integration tests: temp files only, MinIO/LocalStack, real cloud sandbox | Disposable PostgreSQL + temp private filesystem + fake scanner; optional LocalStack later | Deterministic/no external PII; provider semantics need later sandbox tests | Base strategy can proceed after schema approval. |

Additional explicit approvals:

- identity choice semantics and front/back rules for each type;
- required documents during booking versus a future pending workflow;
- whether image re-encoding/metadata stripping is approved;
- whether actual provider GET evidence uses CloudTrail data events and its retention/cost;
- whether legacy ADMIN automatic document capabilities are removed as recommended;
- who owns retention jobs, incident alerts, DPA/TIA review, and access-role assignment.

## 17. Estimated dependencies and infrastructure

No dependency has been installed.

Recommended application packages after approval:

- `@aws-sdk/client-s3`
- `@aws-sdk/s3-presigned-post`
- `file-type`
- `sharp` only if image decode/re-encode and metadata stripping are approved
- no PDF package until a defensible structural validator/CDR is selected

Infrastructure dependencies:

- private S3 bucket in Frankfurt with public access blocked and default SSE-KMS;
- dedicated KMS key and least-privilege uploader/verifier/scanner/reader/deleter roles;
- GuardDuty Malware Protection plan on quarantine prefix, tags and EventBridge;
- authenticated EventBridge delivery target/worker and replay/dead-letter strategy;
- CloudTrail S3 data events, KMS/IAM monitoring and alarms;
- authenticated scheduled cleanup/deletion/reconciliation worker;
- secret management outside browser/database/audit/logs.

## 18. Implementation phases and test strategy

Implementation remains gated. If the owner approves the architecture, execute in separately reviewable stages:

1. **Phase 8B schema gate:** produce the exact additive Prisma and SQL diff, migration/backfill/constraint plan, and disposable-PostgreSQL replay evidence. Stop again for approval before applying the migration to any non-disposable environment.
2. **Domain and disposable adapters:** implement provider-neutral storage/scanner contracts, guarded state machines, file validation, mode-0700 temporary storage, fake scanner, and deterministic synthetic fixtures.
3. **Policy and health:** implement document-policy draft/validation/attach UI, stable health codes, and release-activation blockers without enabling production uploads.
4. **Upload and booking saga:** implement authenticated sessions/intents, direct quarantined upload completion, metadata verification, asynchronous scan results, replacement, expiry/reconciliation, and atomic clean-document Booking binding.
5. **Sensitive access and lifecycle:** add explicit roles, recent authentication, audited short reads, retention, legal holds, deletion workers, monitoring, and incident controls.
6. **Approved production adapter:** only after separate infrastructure authorization, add the selected provider SDK/configuration, validate region/privacy/encryption/scanner behavior in a synthetic cloud sandbox, and complete operational readiness evidence.

Tests use only synthetic, non-sensitive files, disposable PostgreSQL, a process-scoped mode-0700 temporary directory, and a deterministic fake scanner. No repository-configured database, customer document, identity datum, or external provider account is used during the base suite; temporary storage and containers are removed afterward.

Required coverage:

- **File validation:** valid approved JPEG/PNG and, only if later approved, PDF; empty/oversized files; double/unsafe extensions; declared/detected MIME and signature mismatches; polyglots; decompression/pixel limits; password-protected/active content.
- **Lifecycle and concurrency:** clean, infected, unsupported, error and timeout results; abandoned upload; object-without-row reconciliation; duplicate completion/callback/deletion; stale revisions; concurrent replacement and hold actions; bounded retries and provider outages.
- **Authorization:** unauthorized list/view/download/direct-ID access; view-only/download/delete/hold separation; removed ADMIN shortcut; exact release-policy permission; recent-auth expiry; signed-access expiry; no permanent URL/key exposure; safe audit.
- **Booking:** legacy flow without active policy; required/optional/disabled policy; Identity Card-or-Passport; Driving Licence sides; missing/unscanned/infected/wrong-customer/wrong-session/release-drift rejection; exact provenance; transactional retry; historical-policy isolation.
- **Retention/deletion:** completion, cancellation, changed dates, abandonment, hold/release, hard ceiling, deletion grace/retry, provider object already missing, all-version deletion when enabled, tombstone and append-only audit.
- **Health/release:** each specified stable blocker, dependency outage after activation, valid READY state, and activation recheck.
- **Provider contract after approval:** private access, exact region, KMS headers, signed conditions/age, checksum/metadata normalization, event authentication/deduplication, exact deletion, error mapping, CloudTrail evidence, and no public path.

After approved implementation, run Prisma format/validate/generate, complete migration replay from empty and representative legacy data on disposable PostgreSQL, schema-to-migration diff, typecheck, full tests, scoped ESLint, production build, and `git diff --check`. Visual verification covers policy administration, customer progress/pending/rejection/replacement, least-privilege admin metadata and sensitive actions, retention/hold states, and mobile/desktop layouts without an authentication bypass.

## 19. File-by-file Phase 8B plan

| Area | Planned changes after approval |
|---|---|
| `prisma/schema.prisma` | Approved enums, sessions/intents, policy translations/identity choice, document provenance/security fields and inverse relations. |
| `prisma/migrations/<approved_phase8>/migration.sql` | Additive columns/models/enums/indexes/FKs/checks/deferred transitions; no historical fabrication. |
| `lib/authorization/*` and capability seed migration | Narrow sensitive ADMIN behavior; add policy/hold capabilities and explicit roles. |
| `lib/documents/types.ts`, `policy.ts`, `state-machine.ts` | Provider-neutral contracts, slots, requirements and guarded transitions. |
| `lib/documents/file-validation.ts` | Extension/MIME/magic/checksum/size/image limits with stable safe codes. |
| `lib/documents/repository.ts`, `prisma-repository.ts`, `service.ts` | Session/intent lifecycle, idempotency, booking binding and evidence. |
| `lib/documents/authorization.ts`, `access-service.ts` | Capability + release-policy authorization, recent auth and audited reads. |
| `lib/documents/retention.ts`, `deletion-service.ts`, `legal-hold-service.ts` | Deadline calculation, holds, scheduled idempotent deletion and tombstones. |
| `lib/storage/private-object-store.ts` | Provider-neutral interface and safe error mapping. |
| `lib/storage/local-private-adapter.ts` | Disposable mode-0700 filesystem, opaque keys, no public URLs. |
| `lib/storage/aws-s3-private-adapter.ts` | Added only after AWS approval; presigned POST, metadata, read, quarantine and exact delete. |
| `lib/malware/scanner.ts`, `fake-scanner.ts`, `guardduty-scanner.ts` | Normalized results, callback verification, health and idempotency. |
| `app/api/documents/sessions`, `intents`, `complete` | Authenticated bounded upload orchestration; never accepts storage/provenance claims. |
| `app/api/documents/scan-events` | Provider-authenticated normalized idempotent results; no raw report logging. |
| `app/api/documents/[id]/view`, `download`, `delete`, `legal-hold` | Per-request authorization, recent auth and audit. |
| `app/api/cron/document-retention` | Authenticated cleanup/reconciliation/deletion worker. |
| `lib/business-configuration/*` | Full document-policy contract, health, release and workflow validation. |
| `app/[locale]/admin/business-configuration/documents` and components | Policy draft/edit/validate/attach with hard security limits outside admin control. |
| Checkout and booking service | Required slots, upload UI, clean verification and transactional binding. |
| Admin booking details | Minimal metadata/status/hold/retention and gated sensitive actions. |
| `messages/de.json`, `messages/en.json` | Safe instructions, errors, retention summaries and warnings. |
| `tests/unit/documents`, disposable integration scripts | Required file/lifecycle/auth/booking/retention/concurrency/security coverage. |
| `docs/car-rental-audit/16-phase-8-private-documents-implementation.md` | Final migration, infrastructure, tests, visual verification and operations evidence. |

## 20. Proposed commit sequence

1. `docs: approve Phase 8 private-document architecture decisions`
2. `db: add Phase 8 upload and document provenance contracts`
3. `feat: add private-store scanner and local test adapters`
4. `feat: add document policy administration and health gates`
5. `feat: add quarantined upload verification lifecycle`
6. `feat: add least-privilege audited document access`
7. `feat: bind clean documents to authoritative bookings`
8. `feat: add retention legal hold deletion and incident controls`
9. `test: verify private document security and disposable workflows`
10. `docs: record Phase 8 implementation and operational evidence`

Each commit must build and preserve `.graphifyignore`, `graphify-out/`, prior releases, and unrelated work.

## 21. Exact approval checklist

Phase 8B must not begin until the owner explicitly approves or replaces every checked value:

- [ ] AWS S3 as provider and `eu-central-1` as the only content region.
- [ ] Private bucket, Block Public Access, no CDN/public delivery.
- [ ] Customer-managed SSE-KMS key and named security/operations owner.
- [ ] GuardDuty Malware Protection for S3 and EventBridge delivery/dead-letter design.
- [ ] Hybrid staged presigned upload.
- [ ] 10 MiB hard maximum and two-file hard maximum per type.
- [ ] JPEG/PNG launch allowlist; explicit PDF defer/validator decision.
- [ ] Identity Card/Passport choice semantics and Driving Licence side/count rules.
- [ ] Required `DURING_BOOKING` documents block Booking until clean; no pending Booking state.
- [ ] 30-day default, 90-day hard maximum, seven-day deletion grace, 24-hour abandoned/infected cleanup.
- [ ] Dedicated reviewer/downloader/deleter/legal-hold roles and exact initial assignees.
- [ ] Removal of blanket legacy ADMIN access to sensitive document capabilities.
- [ ] Ten-minute recent reauthentication for downloads.
- [ ] 60-second signed URL, provider hard ceiling five minutes, CloudTrail data-event evidence.
- [ ] Customer metadata/status only; no customer content/download access.
- [ ] No content backup/versioning, or an approved EU deletion-propagating alternative.
- [ ] Legal-hold authority, reason/review process, and indefinite-hold approval rule.
- [ ] Incident owners, escalation contacts, DPA/TIA review and evidence retention.
- [ ] Disposable temp-filesystem adapter and fake scanner for development/tests.
- [ ] Additive schema proposal, nullable historical compatibility, database checks/triggers, and provider dependencies.
- [ ] Production infrastructure/account creation is separately authorized; no credentials enter the repository.

Approval of the document alone should specify whether it authorizes only Phase 8B schema/migration work or the full staged implementation. The next mandatory gate should review the exact Prisma diff and SQL before any migration is applied.
