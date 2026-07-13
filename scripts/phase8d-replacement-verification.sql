\set ON_ERROR_STOP on

-- Requires scripts/phase8c-schema-verification.sql data, removal of its synthetic
-- p8-cycle-b/p8-cycle-a rows, and the Phase 8D forward migration.

-- Create a clean current predecessor in the existing synthetic slot.
INSERT INTO "DocumentUploadIntent" (
  id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
  "idempotencyKey", "filePolicyVersion", "normalizedExtension", "declaredMimeType", "expectedSizeBytes",
  "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId", "storageKey", "providerUploadId",
  status, revision, "expiresAt", "cleanupEligibleAt", "uploadCompletedAt", "verificationStartedAt", "createdAt", "updatedAt"
) VALUES (
  'p8d-intent-a', 'p8-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 4,
  'p8d-idem-a', 1, '.jpg', 'image/jpeg', 128, repeat('e',64), 'local-private', 'local-test', 'phase8c',
  'opaque-p8d-a', 'provider-p8d-a', 'SCAN_PENDING', 1, CURRENT_TIMESTAMP + interval '1 hour',
  CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", side, sequence, "storageProviderId", "storageRegion", "storageKey",
  "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes", "checksumSha256",
  "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt", "evidenceSchemaVersion", "uploadSessionId",
  "uploadIntentId", "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "slotNumber",
  "attemptNumber", "isCurrent", "storageContainerId", "declaredMimeType", "filePolicyVersion", "quarantineStatus",
  "quarantinedAt", "fileValidatorVersion", "metadataVerifiedAt", "scanAttemptCount", "scanRequestedAt", "retentionBasis",
  "retentionBasisAt", "retentionPolicyDaysSnapshot", "hardRetentionDaysSnapshot", "deletionEligibleAt"
) VALUES (
  'p8d-document-a', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 4,
  'local-private', 'local-test', 'opaque-approved-p8d-a', 'image/jpeg', 'image/jpeg', 'JPEG', '.jpg', 128, repeat('e',64),
  'VERIFYING', 'PENDING', CURRENT_TIMESTAMP + interval '90 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 'p8-session',
  'p8d-intent-a', 'p8-release', 'p8-documents', 'document-type-driving-licence', 1, 4, true, 'phase8c', 'image/jpeg', 1,
  'QUARANTINED', CURRENT_TIMESTAMP, 'phase8-validator-v1', CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP,
  'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365, CURRENT_TIMESTAMP + interval '90 days'
);

BEGIN;
INSERT INTO "DocumentMalwareScanAttempt" (
  id, "customerDocumentId", "attemptNumber", "scannerProviderId", "providerReference", "providerEventId",
  "startedAt", "completedAt", outcome, "safeResultCode", retryable
) VALUES ('p8d-scan-a', 'p8d-document-a', 1, 'fake-scanner', 'p8d-scan-a', 'p8d-event-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'CLEAN', 'CLEAN', false);
UPDATE "CustomerDocument" SET "scanStatus"='CLEAN', "scanAttemptCount"=1, "scanCompletedAt"=CURRENT_TIMESTAMP,
  "scanResultCode"='CLEAN', "updatedAt"=CURRENT_TIMESTAMP WHERE id='p8d-document-a';
COMMIT;
UPDATE "DocumentUploadIntent" SET status='CLEAN', revision=2, "completedAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE id='p8d-intent-a';
UPDATE "CustomerDocument" SET "uploadStatus"='READY', "quarantineStatus"='RELEASED',
  "releasedFromQuarantineAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE id='p8d-document-a';

-- A pending replacement may reference the still-current clean predecessor.
INSERT INTO "DocumentUploadIntent" (
  id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
  "idempotencyKey", "filePolicyVersion", "normalizedExtension", "declaredMimeType", "expectedSizeBytes",
  "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId", "storageKey", "providerUploadId",
  status, revision, "expiresAt", "cleanupEligibleAt", "uploadCompletedAt", "verificationStartedAt", "createdAt", "updatedAt"
) VALUES (
  'p8d-intent-b', 'p8-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 5,
  'p8d-idem-b', 1, '.jpg', 'image/jpeg', 128, repeat('f',64), 'local-private', 'local-test', 'phase8c',
  'opaque-p8d-b', 'provider-p8d-b', 'SCAN_PENDING', 1, CURRENT_TIMESTAMP + interval '1 hour',
  CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", side, sequence, "storageProviderId", "storageRegion", "storageKey",
  "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes", "checksumSha256",
  "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt", "evidenceSchemaVersion", "uploadSessionId",
  "uploadIntentId", "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "slotNumber",
  "attemptNumber", "isCurrent", "replacesDocumentId", "storageContainerId", "declaredMimeType", "filePolicyVersion",
  "quarantineStatus", "quarantinedAt", "fileValidatorVersion", "metadataVerifiedAt", "scanAttemptCount", "scanRequestedAt",
  "retentionBasis", "retentionBasisAt", "retentionPolicyDaysSnapshot", "hardRetentionDaysSnapshot", "deletionEligibleAt"
) VALUES (
  'p8d-document-b', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 5,
  'local-private', 'local-test', 'opaque-approved-p8d-b', 'image/jpeg', 'image/jpeg', 'JPEG', '.jpg', 128, repeat('f',64),
  'VERIFYING', 'PENDING', CURRENT_TIMESTAMP + interval '90 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 'p8-session',
  'p8d-intent-b', 'p8-release', 'p8-documents', 'document-type-driving-licence', 1, 5, false, 'p8d-document-a',
  'phase8c', 'image/jpeg', 1, 'QUARANTINED', CURRENT_TIMESTAMP, 'phase8-validator-v1', CURRENT_TIMESTAMP, 0,
  CURRENT_TIMESTAMP, 'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365, CURRENT_TIMESTAMP + interval '90 days'
);

DO $$
BEGIN
  IF NOT (SELECT "isCurrent" FROM "CustomerDocument" WHERE id='p8d-document-a') OR
     (SELECT "isCurrent" FROM "CustomerDocument" WHERE id='p8d-document-b') THEN
    RAISE EXCEPTION 'Pending replacement changed current document prematurely';
  END IF;
END;
$$;

-- A concurrent pending candidate loses the partial-unique race.
INSERT INTO "DocumentUploadIntent" (
  id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
  "idempotencyKey", "filePolicyVersion", "normalizedExtension", "declaredMimeType", "expectedSizeBytes",
  "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId", "storageKey", "providerUploadId",
  status, revision, "expiresAt", "cleanupEligibleAt", "uploadCompletedAt", "verificationStartedAt", "createdAt", "updatedAt"
) VALUES (
  'p8d-intent-c', 'p8-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 6,
  'p8d-idem-c', 1, '.jpg', 'image/jpeg', 128, repeat('1',64), 'local-private', 'local-test', 'phase8c',
  'opaque-p8d-c', 'provider-p8d-c', 'SCAN_PENDING', 1, CURRENT_TIMESTAMP + interval '1 hour',
  CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

DO $$
BEGIN
  BEGIN
    INSERT INTO "CustomerDocument" (
      id, "customerUserId", "uploadedById", "documentTypeId", side, sequence, "storageProviderId", "storageRegion", "storageKey",
      "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes", "checksumSha256",
      "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt", "evidenceSchemaVersion", "uploadSessionId",
      "uploadIntentId", "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "slotNumber",
      "attemptNumber", "isCurrent", "replacesDocumentId", "storageContainerId", "declaredMimeType", "filePolicyVersion",
      "quarantineStatus", "quarantinedAt", "fileValidatorVersion", "metadataVerifiedAt", "scanAttemptCount", "scanRequestedAt",
      "retentionBasis", "retentionBasisAt", "retentionPolicyDaysSnapshot", "hardRetentionDaysSnapshot", "deletionEligibleAt"
    ) VALUES (
      'p8d-document-c', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 6,
      'local-private', 'local-test', 'opaque-approved-p8d-c', 'image/jpeg', 'image/jpeg', 'JPEG', '.jpg', 128, repeat('1',64),
      'VERIFYING', 'PENDING', CURRENT_TIMESTAMP + interval '90 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 'p8-session',
      'p8d-intent-c', 'p8-release', 'p8-documents', 'document-type-driving-licence', 1, 6, false, 'p8d-document-a',
      'phase8c', 'image/jpeg', 1, 'QUARANTINED', CURRENT_TIMESTAMP, 'phase8-validator-v1', CURRENT_TIMESTAMP, 0,
      CURRENT_TIMESTAMP, 'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365, CURRENT_TIMESTAMP + interval '90 days'
    );
    RAISE EXCEPTION 'expected concurrent pending replacement rejection';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

-- An infected/rejected replacement leaves the predecessor current and becomes terminal.
BEGIN;
INSERT INTO "DocumentMalwareScanAttempt" (
  id, "customerDocumentId", "attemptNumber", "scannerProviderId", "providerReference", "providerEventId",
  "startedAt", "completedAt", outcome, "safeResultCode", retryable
) VALUES ('p8d-scan-b', 'p8d-document-b', 1, 'fake-scanner', 'p8d-scan-b', 'p8d-event-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'INFECTED', 'INFECTED', false);
UPDATE "CustomerDocument" SET "scanStatus"='INFECTED', "scanAttemptCount"=1, "scanCompletedAt"=CURRENT_TIMESTAMP,
  "scanResultCode"='INFECTED', "uploadStatus"='REJECTED', "updatedAt"=CURRENT_TIMESTAMP WHERE id='p8d-document-b';
UPDATE "DocumentUploadIntent" SET status='REJECTED', revision=2, "completedAt"=CURRENT_TIMESTAMP,
  "failureCode"='SCAN_INFECTED', "updatedAt"=CURRENT_TIMESTAMP WHERE id='p8d-intent-b';
COMMIT;

-- Terminal failure no longer occupies the pending index, so a new attempt is allowed.
INSERT INTO "DocumentUploadIntent" (
  id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
  "idempotencyKey", "filePolicyVersion", "normalizedExtension", "declaredMimeType", "expectedSizeBytes",
  "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId", "storageKey", "providerUploadId",
  status, revision, "expiresAt", "cleanupEligibleAt", "uploadCompletedAt", "verificationStartedAt", "createdAt", "updatedAt"
) VALUES (
  'p8d-intent-d', 'p8-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 7,
  'p8d-idem-d', 1, '.jpg', 'image/jpeg', 128, repeat('2',64), 'local-private', 'local-test', 'phase8c',
  'opaque-p8d-d', 'provider-p8d-d', 'SCAN_PENDING', 1, CURRENT_TIMESTAMP + interval '1 hour',
  CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", side, sequence, "storageProviderId", "storageRegion", "storageKey",
  "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes", "checksumSha256",
  "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt", "evidenceSchemaVersion", "uploadSessionId",
  "uploadIntentId", "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "slotNumber",
  "attemptNumber", "isCurrent", "replacesDocumentId", "storageContainerId", "declaredMimeType", "filePolicyVersion",
  "quarantineStatus", "quarantinedAt", "fileValidatorVersion", "metadataVerifiedAt", "scanAttemptCount", "scanRequestedAt",
  "retentionBasis", "retentionBasisAt", "retentionPolicyDaysSnapshot", "hardRetentionDaysSnapshot", "deletionEligibleAt"
) VALUES (
  'p8d-document-d', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 7,
  'local-private', 'local-test', 'opaque-approved-p8d-d', 'image/jpeg', 'image/jpeg', 'JPEG', '.jpg', 128, repeat('2',64),
  'VERIFYING', 'PENDING', CURRENT_TIMESTAMP + interval '90 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 'p8-session',
  'p8d-intent-d', 'p8-release', 'p8-documents', 'document-type-driving-licence', 1, 7, false, 'p8d-document-a',
  'phase8c', 'image/jpeg', 1, 'QUARANTINED', CURRENT_TIMESTAMP, 'phase8-validator-v1', CURRENT_TIMESTAMP, 0,
  CURRENT_TIMESTAMP, 'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365, CURRENT_TIMESTAMP + interval '90 days'
);

-- A failed promotion rolls back the predecessor update as well.
DO $$
BEGIN
  BEGIN
    UPDATE "CustomerDocument" SET "isCurrent"=false, "updatedAt"=CURRENT_TIMESTAMP WHERE id='p8d-document-a' AND "isCurrent"=true;
    UPDATE "CustomerDocument" SET "uploadStatus"='READY', "isCurrent"=true, "quarantineStatus"='RELEASED',
      "releasedFromQuarantineAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE id='p8d-document-d';
    RAISE EXCEPTION 'expected promotion to fail before clean intent/scan evidence';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  IF NOT (SELECT "isCurrent" FROM "CustomerDocument" WHERE id='p8d-document-a') OR
     (SELECT "isCurrent" FROM "CustomerDocument" WHERE id='p8d-document-d') THEN
    RAISE EXCEPTION 'Failed promotion did not roll back atomically';
  END IF;
END;
$$;

BEGIN;
INSERT INTO "DocumentMalwareScanAttempt" (
  id, "customerDocumentId", "attemptNumber", "scannerProviderId", "providerReference", "providerEventId",
  "startedAt", "completedAt", outcome, "safeResultCode", retryable
) VALUES ('p8d-scan-d', 'p8d-document-d', 1, 'fake-scanner', 'p8d-scan-d', 'p8d-event-d', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'CLEAN', 'CLEAN', false);
UPDATE "CustomerDocument" SET "scanStatus"='CLEAN', "scanAttemptCount"=1, "scanCompletedAt"=CURRENT_TIMESTAMP,
  "scanResultCode"='CLEAN', "updatedAt"=CURRENT_TIMESTAMP WHERE id='p8d-document-d';
COMMIT;
UPDATE "DocumentUploadIntent" SET status='CLEAN', revision=2, "completedAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE id='p8d-intent-d';

-- Successful atomic promotion.
BEGIN;
UPDATE "CustomerDocument" SET "isCurrent"=false, "updatedAt"=CURRENT_TIMESTAMP
WHERE id='p8d-document-a' AND "isCurrent"=true;
UPDATE "CustomerDocument" SET "uploadStatus"='READY', "isCurrent"=true, "quarantineStatus"='RELEASED',
  "releasedFromQuarantineAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE id='p8d-document-d';
COMMIT;

DO $$
BEGIN
  IF (SELECT "isCurrent" FROM "CustomerDocument" WHERE id='p8d-document-a') OR
     NOT (SELECT "isCurrent" FROM "CustomerDocument" WHERE id='p8d-document-d') THEN
    RAISE EXCEPTION 'Atomic replacement promotion did not switch current evidence';
  END IF;

  BEGIN
    INSERT INTO "CustomerDocument" (
      id, "customerUserId", "uploadedById", "documentTypeId", side, sequence, "storageProviderId", "storageRegion", "storageKey",
      "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes", "checksumSha256",
      "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt", "evidenceSchemaVersion", "uploadSessionId",
      "uploadIntentId", "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "slotNumber",
      "attemptNumber", "isCurrent", "replacesDocumentId", "storageContainerId", "declaredMimeType", "filePolicyVersion",
      "quarantineStatus", "quarantinedAt", "fileValidatorVersion", "metadataVerifiedAt", "scanAttemptCount", "scanRequestedAt",
      "retentionBasis", "retentionBasisAt", "retentionPolicyDaysSnapshot", "hardRetentionDaysSnapshot", "deletionEligibleAt"
    ) VALUES (
      'p8d-self', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 6,
      'local-private', 'local-test', 'opaque-self', 'image/jpeg', 'image/jpeg', 'JPEG', '.jpg', 128, repeat('1',64),
      'VERIFYING', 'PENDING', CURRENT_TIMESTAMP + interval '90 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 'p8-session',
      'p8d-intent-c', 'p8-release', 'p8-documents', 'document-type-driving-licence', 1, 6, false, 'p8d-self',
      'phase8c', 'image/jpeg', 1, 'QUARANTINED', CURRENT_TIMESTAMP, 'phase8-validator-v1', CURRENT_TIMESTAMP, 0,
      CURRENT_TIMESTAMP, 'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365, CURRENT_TIMESTAMP + interval '90 days'
    );
    RAISE EXCEPTION 'expected self-reference rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  BEGIN
    UPDATE "CustomerDocument" SET "replacesDocumentId"='p8d-document-d', "updatedAt"=CURRENT_TIMESTAMP WHERE id='p8d-document-b';
    RAISE EXCEPTION 'expected immutable/cyclic replacement rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;
