\set ON_ERROR_STOP on

-- Requires the synthetic Phase 8C fixture. No file bytes or personal data are used.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CustomerDocument"
    WHERE id = 'p8-legacy-document' AND (
      "manualReviewStatus" <> 'NOT_READY' OR "reviewRevision" <> 0 OR
      "reviewedById" IS NOT NULL OR "reviewedAt" IS NOT NULL OR
      "reviewReasonCode" IS NOT NULL OR "safeReviewerNote" IS NOT NULL
    )
  ) OR EXISTS (
    SELECT 1 FROM "CustomerDocumentReviewDecision" WHERE "customerDocumentId" = 'p8-legacy-document'
  ) THEN
    RAISE EXCEPTION 'Historical document review evidence was fabricated';
  END IF;
END;
$$;
-- Manual-mode replacement: technical validation is complete without scanner evidence.
INSERT INTO "DocumentUploadIntent" (
  id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
  "idempotencyKey", "filePolicyVersion", "originalFileName", "normalizedExtension", "declaredMimeType",
  "expectedSizeBytes", "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId",
  "storageKey", "providerUploadId", status, revision, "expiresAt", "cleanupEligibleAt", "uploadCompletedAt",
  "verificationStartedAt", "completedAt", "createdAt", "updatedAt"
) VALUES (
  'p8f-intent-2', 'p8-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 2,
  'p8f-idem-2', 1, 'synthetic.jpg', '.jpg', 'image/jpeg', 128, repeat('c', 64), 'vercel-blob-private',
  'eu-test', 'synthetic-private', 'opaque-p8f-2', 'provider-p8f-2', 'TECHNICALLY_VALID', 1,
  CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", side, sequence,
  "storageProviderId", "storageRegion", "storageKey", "originalFileName", "normalizedMimeType",
  "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes", "checksumSha256",
  "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt", "evidenceSchemaVersion",
  "uploadSessionId", "uploadIntentId", "configurationReleaseId", "documentPolicyConfigVersionId",
  "documentRequirementTypeId", "slotNumber", "attemptNumber", "isCurrent", "replacesDocumentId",
  "storageContainerId", "declaredMimeType", "filePolicyVersion", "quarantineStatus", "quarantinedAt",
  "fileValidatorVersion", "metadataVerifiedAt", "scanAttemptCount", "retentionBasis", "retentionBasisAt",
  "retentionPolicyDaysSnapshot", "hardRetentionDaysSnapshot", "deletionEligibleAt", "manualReviewStatus"
) VALUES (
  'p8f-document-2', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 2,
  'vercel-blob-private', 'eu-test', 'opaque-p8f-2', 'synthetic.jpg', 'image/jpeg', 'image/jpeg', 'JPEG', '.jpg',
  128, repeat('c', 64), 'TECHNICALLY_VALID', 'NOT_AVAILABLE', CURRENT_TIMESTAMP + interval '90 days',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 'p8-session', 'p8f-intent-2', 'p8-release', 'p8-documents',
  'document-type-driving-licence', 1, 2, false, 'p8-document-1', 'synthetic-private', 'image/jpeg', 1,
  'QUARANTINED', CURRENT_TIMESTAMP, 'phase8f-validator-v1', CURRENT_TIMESTAMP, 0,
  'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365, CURRENT_TIMESTAMP + interval '90 days', 'PENDING_REVIEW'
);

DO $$
BEGIN
  IF NOT (SELECT "isCurrent" FROM "CustomerDocument" WHERE id = 'p8-document-1') OR
     (SELECT "isCurrent" FROM "CustomerDocument" WHERE id = 'p8f-document-2') THEN
    RAISE EXCEPTION 'Pending manual replacement changed the current document';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "CustomerDocument" WHERE id = 'p8f-document-2' AND
      ("scanStatus" <> 'NOT_AVAILABLE' OR "scanAttemptCount" <> 0 OR "scanRequestedAt" IS NOT NULL OR
       "scanCompletedAt" IS NOT NULL OR "scanResultCode" IS NOT NULL OR "scanProviderReference" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Manual technical validation fabricated scanner evidence';
  END IF;

  BEGIN
    UPDATE "CustomerDocument" SET "manualReviewStatus" = 'APPROVED', "reviewRevision" = 2,
      "reviewedById" = 'p8-officer', "reviewedAt" = transaction_timestamp(),
      "quarantineStatus" = 'RELEASED', "releasedFromQuarantineAt" = transaction_timestamp(),
      "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8f-document-2';
    RAISE EXCEPTION 'expected stale review revision rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  BEGIN
    INSERT INTO "CustomerDocumentReviewDecision" (
      id, "customerDocumentId", "decisionVersion", "previousStatus", decision, "reasonCode", "reviewedById",
      "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "uploadSessionId",
      "customerUserId", "slotNumber", side, "attemptNumber"
    ) VALUES (
      'p8f-invalid-approval', 'p8f-document-2', 1, 'PENDING_REVIEW', 'APPROVED', 'UNREADABLE', 'p8-officer',
      'p8-release', 'p8-documents', 'document-type-driving-licence', 'p8-session', 'p8-customer', 1, 'SINGLE', 2
    );
    RAISE EXCEPTION 'expected approval reason rejection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "CustomerDocumentReviewDecision" (
      id, "customerDocumentId", "decisionVersion", "previousStatus", decision, "reviewedById",
      "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "uploadSessionId",
      "customerUserId", "slotNumber", side, "attemptNumber"
    ) VALUES (
      'p8f-invalid-rejection', 'p8f-document-2', 1, 'PENDING_REVIEW', 'REJECTED', 'p8-officer',
      'p8-release', 'p8-documents', 'document-type-driving-licence', 'p8-session', 'p8-customer', 1, 'SINGLE', 2
    );
    RAISE EXCEPTION 'expected rejection reason requirement';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "CustomerDocumentReviewDecision" (
      id, "customerDocumentId", "decisionVersion", "previousStatus", decision, "reasonCode", "reviewedById",
      "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "uploadSessionId",
      "customerUserId", "slotNumber", side, "attemptNumber"
    ) VALUES (
      'p8f-invalid-other', 'p8f-document-2', 1, 'PENDING_REVIEW', 'REJECTED', 'OTHER', 'p8-officer',
      'p8-release', 'p8-documents', 'document-type-driving-licence', 'p8-session', 'p8-customer', 1, 'SINGLE', 2
    );
    RAISE EXCEPTION 'expected OTHER note requirement';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

-- Approve and atomically promote the cleanly validated manual replacement.
BEGIN;
INSERT INTO "CustomerDocumentReviewDecision" (
  id, "customerDocumentId", "decisionVersion", "previousStatus", decision, "reviewedById", "reviewedAt",
  "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "uploadSessionId",
  "customerUserId", "slotNumber", side, "attemptNumber"
) VALUES (
  'p8f-decision-2', 'p8f-document-2', 1, 'PENDING_REVIEW', 'APPROVED', 'p8-officer', transaction_timestamp(),
  'p8-release', 'p8-documents', 'document-type-driving-licence', 'p8-session', 'p8-customer', 1, 'SINGLE', 2
);
UPDATE "CustomerDocument" SET "isCurrent" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8-document-1' AND "isCurrent" = true;
UPDATE "CustomerDocument" SET
  "manualReviewStatus" = 'APPROVED', "reviewRevision" = 1, "reviewedById" = 'p8-officer',
  "reviewedAt" = transaction_timestamp(), "quarantineStatus" = 'RELEASED',
  "releasedFromQuarantineAt" = transaction_timestamp(), "isCurrent" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8f-document-2' AND "reviewRevision" = 0 AND "manualReviewStatus" = 'PENDING_REVIEW';
COMMIT;

DO $$
BEGIN
  IF (SELECT "isCurrent" FROM "CustomerDocument" WHERE id = 'p8-document-1') OR
     NOT (SELECT "isCurrent" FROM "CustomerDocument" WHERE id = 'p8f-document-2') OR
     (SELECT "manualReviewStatus" <> 'APPROVED' FROM "CustomerDocument" WHERE id = 'p8f-document-2') THEN
    RAISE EXCEPTION 'Manual replacement promotion was not atomic';
  END IF;
  BEGIN
    UPDATE "CustomerDocumentReviewDecision" SET "safeReviewerNote" = 'changed' WHERE id = 'p8f-decision-2';
    RAISE EXCEPTION 'expected append-only review history rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    UPDATE "CustomerDocument" SET "manualReviewStatus" = 'PENDING_REVIEW', "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = 'p8f-document-2';
    RAISE EXCEPTION 'expected terminal review transition rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

-- A rejected candidate remains non-current and does not displace the approved predecessor.
INSERT INTO "DocumentUploadIntent" (
  id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
  "idempotencyKey", "filePolicyVersion", "originalFileName", "normalizedExtension", "declaredMimeType",
  "expectedSizeBytes", "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId",
  "storageKey", "providerUploadId", status, revision, "expiresAt", "cleanupEligibleAt", "uploadCompletedAt",
  "verificationStartedAt", "completedAt", "createdAt", "updatedAt"
) VALUES (
  'p8f-intent-3', 'p8-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 3,
  'p8f-idem-3', 1, 'synthetic.jpg', '.jpg', 'image/jpeg', 128, repeat('d', 64), 'vercel-blob-private',
  'eu-test', 'synthetic-private', 'opaque-p8f-3', 'provider-p8f-3', 'TECHNICALLY_VALID', 1,
  CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", side, sequence, "storageProviderId", "storageRegion",
  "storageKey", "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes",
  "checksumSha256", "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt", "evidenceSchemaVersion",
  "uploadSessionId", "uploadIntentId", "configurationReleaseId", "documentPolicyConfigVersionId",
  "documentRequirementTypeId", "slotNumber", "attemptNumber", "isCurrent", "replacesDocumentId", "storageContainerId",
  "declaredMimeType", "filePolicyVersion", "quarantineStatus", "quarantinedAt", "fileValidatorVersion",
  "metadataVerifiedAt", "scanAttemptCount", "retentionBasis", "retentionBasisAt", "retentionPolicyDaysSnapshot",
  "hardRetentionDaysSnapshot", "deletionEligibleAt", "manualReviewStatus"
) VALUES (
  'p8f-document-3', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 3,
  'vercel-blob-private', 'eu-test', 'opaque-p8f-3', 'image/jpeg', 'image/jpeg', 'JPEG', '.jpg', 128, repeat('d', 64),
  'TECHNICALLY_VALID', 'NOT_AVAILABLE', CURRENT_TIMESTAMP + interval '90 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  2, 'p8-session', 'p8f-intent-3', 'p8-release', 'p8-documents', 'document-type-driving-licence', 1, 3, false,
  'p8f-document-2', 'synthetic-private', 'image/jpeg', 1, 'QUARANTINED', CURRENT_TIMESTAMP,
  'phase8f-validator-v1', CURRENT_TIMESTAMP, 0, 'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365,
  CURRENT_TIMESTAMP + interval '90 days', 'PENDING_REVIEW'
);

BEGIN;
INSERT INTO "CustomerDocumentReviewDecision" (
  id, "customerDocumentId", "decisionVersion", "previousStatus", decision, "reasonCode", "safeReviewerNote",
  "reviewedById", "reviewedAt", "configurationReleaseId", "documentPolicyConfigVersionId",
  "documentRequirementTypeId", "uploadSessionId", "customerUserId", "slotNumber", side, "attemptNumber"
) VALUES (
  'p8f-decision-3', 'p8f-document-3', 1, 'PENDING_REVIEW', 'REJECTED', 'OTHER', 'Wrong synthetic test file',
  'p8-officer', transaction_timestamp(), 'p8-release', 'p8-documents', 'document-type-driving-licence',
  'p8-session', 'p8-customer', 1, 'SINGLE', 3
);
UPDATE "CustomerDocument" SET "manualReviewStatus" = 'REJECTED', "reviewRevision" = 1,
  "reviewedById" = 'p8-officer', "reviewedAt" = transaction_timestamp(), "reviewReasonCode" = 'OTHER',
  "safeReviewerNote" = 'Wrong synthetic test file', "quarantineStatus" = 'REJECTED', "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8f-document-3' AND "reviewRevision" = 0;
COMMIT;

DO $$
BEGIN
  IF NOT (SELECT "isCurrent" FROM "CustomerDocument" WHERE id = 'p8f-document-2') OR
     (SELECT "isCurrent" FROM "CustomerDocument" WHERE id = 'p8f-document-3') THEN
    RAISE EXCEPTION 'Rejected replacement displaced approved predecessor';
  END IF;
  IF (SELECT count(*) FROM "Capability" WHERE key IN ('documents.review','documents.request-replacement')) <> 2 OR
     EXISTS (
       SELECT 1 FROM "RoleCapability" mapping
       JOIN "AccessRole" role ON role.id = mapping."accessRoleId"
       JOIN "Capability" capability ON capability.id = mapping."capabilityId"
       WHERE role.key = 'ADMIN_COMPAT' AND capability.key IN ('documents.review','documents.request-replacement')
     ) THEN
    RAISE EXCEPTION 'Restricted capability seed is inconsistent';
  END IF;
END;
$$;

-- Leave a later pending attempt for the two-connection concurrency verifier.
INSERT INTO "DocumentUploadIntent" (
  id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
  "idempotencyKey", "filePolicyVersion", "originalFileName", "normalizedExtension", "declaredMimeType",
  "expectedSizeBytes", "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId",
  "storageKey", "providerUploadId", status, revision, "expiresAt", "cleanupEligibleAt", "uploadCompletedAt",
  "verificationStartedAt", "completedAt", "createdAt", "updatedAt"
)
SELECT 'p8f-intent-4', "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", 4,
  'p8f-idem-4', "filePolicyVersion", "originalFileName", "normalizedExtension", "declaredMimeType",
  "expectedSizeBytes", repeat('e', 64), "storageProviderId", "storageRegion", "storageContainerId",
  'opaque-p8f-4', 'provider-p8f-4', status, revision, "expiresAt", "cleanupEligibleAt", "uploadCompletedAt",
  "verificationStartedAt", "completedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "DocumentUploadIntent" WHERE id = 'p8f-intent-3';

INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", side, sequence, "storageProviderId", "storageRegion",
  "storageKey", "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes",
  "checksumSha256", "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt", "evidenceSchemaVersion",
  "uploadSessionId", "uploadIntentId", "configurationReleaseId", "documentPolicyConfigVersionId",
  "documentRequirementTypeId", "slotNumber", "attemptNumber", "isCurrent", "replacesDocumentId", "storageContainerId",
  "declaredMimeType", "filePolicyVersion", "quarantineStatus", "quarantinedAt", "fileValidatorVersion",
  "metadataVerifiedAt", "scanAttemptCount", "retentionBasis", "retentionBasisAt", "retentionPolicyDaysSnapshot",
  "hardRetentionDaysSnapshot", "deletionEligibleAt", "manualReviewStatus", "reviewRevision"
)
SELECT 'p8f-document-4', "customerUserId", "uploadedById", "documentTypeId", side, 4, "storageProviderId",
  "storageRegion", 'opaque-p8f-4', "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension",
  "sizeBytes", repeat('e', 64), "uploadStatus", "scanStatus", "retentionUntil", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  "evidenceSchemaVersion", "uploadSessionId", 'p8f-intent-4', "configurationReleaseId",
  "documentPolicyConfigVersionId", "documentRequirementTypeId", "slotNumber", 4, false, 'p8f-document-2',
  "storageContainerId", "declaredMimeType", "filePolicyVersion", 'QUARANTINED', CURRENT_TIMESTAMP,
  "fileValidatorVersion", CURRENT_TIMESTAMP, 0, "retentionBasis", CURRENT_TIMESTAMP, "retentionPolicyDaysSnapshot",
  "hardRetentionDaysSnapshot", "deletionEligibleAt", 'PENDING_REVIEW', 0
FROM "CustomerDocument" WHERE id = 'p8f-document-3';
