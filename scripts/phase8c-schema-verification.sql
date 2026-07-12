\set ON_ERROR_STOP on

-- Phase 8C disposable PostgreSQL verification. Synthetic metadata only; no file content.

INSERT INTO "User" (id, email, name, role, "isActive", "createdAt", "updatedAt") VALUES
  ('p8-admin', 'admin@phase8.invalid', 'Synthetic legacy admin', 'ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-customer', 'customer@phase8.invalid', 'Synthetic customer', 'USER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-officer', 'officer@phase8.invalid', 'Synthetic hold officer', 'USER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Car" (
  id, slug, name, description, category, price, image, status, gearbox, seats,
  "fuelType", acceleration, "createdAt", "updatedAt"
) VALUES (
  'p8-car', 'p8-car', 'Synthetic Phase 8 car', 'Synthetic metadata only.', 'SEDAN', 10000,
  'https://example.invalid/car.jpg', 'AVAILABLE', 'Automatic', 5, 'Electric', '5 sec',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "LegalDocumentVersion" (
  id, type, "versionNumber", status, "versionLabel", "changeSummary", "createdById", "updatedById", "createdAt", "updatedAt"
) VALUES
  ('p8-terms', 'RENTAL_TERMS', 81, 'DRAFT', 'p8-terms', 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-privacy', 'PRIVACY_NOTICE', 81, 'DRAFT', 'p8-privacy', 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

BEGIN;
INSERT INTO "ConfigurationVersion" (
  id, domain, "versionNumber", status, "validationStatus", "schemaVersion", revision, "changeSummary",
  "createdById", "updatedById", "createdAt", "updatedAt"
) VALUES
  ('p8-general', 'GENERAL_RENTAL', 81, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-pricing', 'PRICING_BILLING', 81, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-insurance', 'INSURANCE', 81, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-customer', 'CUSTOMER_DRIVER_REQUIREMENTS', 81, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-workflow', 'BOOKING_WORKFLOW', 81, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-documents', 'DOCUMENT_POLICY', 81, 'DRAFT', 'NOT_VALIDATED', 2, 1, 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-payments', 'PAYMENTS', 81, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-confirmations', 'CONFIRMATIONS', 81, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-legal', 'LEGAL_ACCEPTANCE', 81, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "GeneralRentalConfigVersion" VALUES ('p8-general', 'Europe/Bucharest', 'EUR', ARRAY['en']);
INSERT INTO "PricingBillingConfigVersion" ("configurationVersionId") VALUES ('p8-pricing');
INSERT INTO "InsuranceConfigVersion" ("configurationVersionId", "showCustomerSelection") VALUES ('p8-insurance', false);
INSERT INTO "CustomerDriverConfigVersion" ("configurationVersionId", "allowedLicenceCountries") VALUES ('p8-customer', ARRAY[]::text[]);
INSERT INTO "BookingWorkflowConfigVersion" VALUES ('p8-workflow');
INSERT INTO "DocumentPolicyConfigVersion" ("configurationVersionId", "retentionPreferenceDays", "identityDocumentChoice")
VALUES ('p8-documents', 90, 'DISABLED');
INSERT INTO "DocumentRequirementRule" (
  "documentPolicyConfigVersionId", "documentTypeId", mode, "fileCount", sides, "uploadStage"
) VALUES ('p8-documents', 'document-type-driving-licence', 'REQUIRED', 1, 'SINGLE_FILE', 'DURING_BOOKING');
INSERT INTO "DocumentRequirementTranslation" (
  id, "documentPolicyConfigVersionId", "documentTypeId", locale, instructions, "updatedAt"
) VALUES ('p8-instructions', 'p8-documents', 'document-type-driving-licence', 'en', 'Upload a synthetic test image.', CURRENT_TIMESTAMP);
INSERT INTO "PaymentConfigVersion" ("configurationVersionId", "defaultMethod", "confirmationMode")
VALUES ('p8-payments', 'BANK_TRANSFER', 'REQUIRES_REVIEW');
INSERT INTO "ConfirmationConfigVersion" VALUES ('p8-confirmations');
INSERT INTO "LegalAcceptanceConfigVersion" (
  "configurationVersionId", "termsDocumentVersionId", "privacyDocumentVersionId",
  "termsAcceptance", "privacyAcknowledgment"
) VALUES ('p8-legal', 'p8-terms', 'p8-privacy', 'DISABLED', 'DISABLED');
COMMIT;

INSERT INTO "FleetRateSet" (
  id, "versionNumber", status, "validationStatus", currency, "changeSummary", "createdById", "updatedById", "createdAt", "updatedAt"
) VALUES ('p8-rates', 81, 'DRAFT', 'NOT_VALIDATED', 'EUR', 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "VehicleRentalRate" (id, "fleetRateSetId", "carId", "dailyRate") VALUES ('p8-rate', 'p8-rates', 'p8-car', 10000);

INSERT INTO "BusinessConfigurationRelease" (
  id, "releaseNumber", status, "validationStatus", revision, name, "changeSummary",
  "generalRentalConfigVersionId", "pricingBillingConfigVersionId", "fleetRateSetId",
  "insuranceConfigVersionId", "customerDriverConfigVersionId", "bookingWorkflowConfigVersionId",
  "documentPolicyConfigVersionId", "paymentConfigVersionId", "confirmationConfigVersionId",
  "legalAcceptanceConfigVersionId", "createdById", "updatedById", "createdAt", "updatedAt"
) VALUES (
  'p8-release', 81, 'DRAFT', 'NOT_VALIDATED', 1, 'Synthetic Phase 8 release', 'Synthetic.',
  'p8-general', 'p8-pricing', 'p8-rates', 'p8-insurance', 'p8-customer', 'p8-workflow',
  'p8-documents', 'p8-payments', 'p8-confirmations', 'p8-legal', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Historical version-1 metadata remains valid without new evidence.
INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", "storageProviderId", "storageRegion", "storageKey",
  "normalizedMimeType", "sizeBytes", "checksumSha256", "retentionUntil", "createdAt", "updatedAt"
) VALUES (
  'p8-legacy-document', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'legacy-private', 'legacy-eu', 'opaque-legacy',
  'image/jpeg', 128, repeat('a',64), CURRENT_TIMESTAMP + interval '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Draft session and intent with exact release/policy/rule binding.
INSERT INTO "DocumentUploadSession" (
  id, "customerUserId", "carId", "pickupAt", "returnAt", locale, "configurationReleaseId",
  "documentPolicyConfigVersionId", status, revision, "expiresAt", "createdAt", "updatedAt"
) VALUES (
  'p8-session', 'p8-customer', 'p8-car', '2035-01-01T10:00:00Z', '2035-01-02T10:00:00Z', 'en', 'p8-release',
  'p8-documents', 'OPEN', 1, CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "DocumentUploadIntent" (
  id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
  "idempotencyKey", "filePolicyVersion", "originalFileName", "normalizedExtension", "declaredMimeType",
  "expectedSizeBytes", "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId",
  "storageKey", "providerUploadId", status, revision, "expiresAt", "cleanupEligibleAt", "createdAt", "updatedAt"
) VALUES (
  'p8-intent-1', 'p8-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 1,
  'p8-idempotency-1', 1, 'synthetic.jpg', '.jpg', 'image/jpeg', 128, repeat('b',64), 'local-private',
  'local-test', 'phase8c', 'opaque-intent-1', 'provider-upload-1', 'INTENT_CREATED', 1,
  CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

DO $$
BEGIN
  BEGIN
    INSERT INTO "DocumentUploadIntent" (
      id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
      "idempotencyKey", "filePolicyVersion", "normalizedExtension", "declaredMimeType", "expectedSizeBytes",
      "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId", "storageKey", status,
      revision, "expiresAt", "cleanupEligibleAt", "createdAt", "updatedAt"
    ) VALUES (
      'p8-intent-duplicate', 'p8-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 2,
      'p8-idempotency-1', 1, '.jpg', 'image/jpeg', 128, repeat('c',64), 'local-private', 'local-test',
      'phase8c', 'opaque-duplicate', 'INTENT_CREATED', 1, CURRENT_TIMESTAMP + interval '1 hour',
      CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'expected duplicate idempotency rejection';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    UPDATE "DocumentUploadSession" SET status = 'CONSUMED', "bookingId" = 'missing', "consumedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-session';
    RAISE EXCEPTION 'expected invalid consumption rejection';
  EXCEPTION WHEN foreign_key_violation OR raise_exception THEN NULL;
  END;
END;
$$;

-- Expired and aborted terminal sessions cannot be consumed or rebound.
INSERT INTO "DocumentUploadSession" (
  id, "customerUserId", "carId", "pickupAt", "returnAt", locale, "configurationReleaseId",
  "documentPolicyConfigVersionId", status, revision, "expiresAt", "createdAt", "updatedAt"
) VALUES (
  'p8-expired-session', 'p8-customer', 'p8-car', '2035-02-01', '2035-02-02', 'en', 'p8-release', 'p8-documents',
  'OPEN', 1, CURRENT_TIMESTAMP - interval '1 minute', CURRENT_TIMESTAMP - interval '1 hour', CURRENT_TIMESTAMP
), (
  'p8-aborted-session', 'p8-customer', 'p8-car', '2035-03-01', '2035-03-02', 'en', 'p8-release', 'p8-documents',
  'OPEN', 1, CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
UPDATE "DocumentUploadSession" SET status = 'EXPIRED', revision = 2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-expired-session';
UPDATE "DocumentUploadSession" SET status = 'ABORTED', revision = 2, "abortedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-aborted-session';

DO $$
BEGIN
  BEGIN
    UPDATE "DocumentUploadSession" SET status = 'CONSUMED', "customerUserId" = 'p8-admin', "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-expired-session';
    RAISE EXCEPTION 'expected expired terminal rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    UPDATE "DocumentUploadSession" SET status = 'CONSUMED', "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-aborted-session';
    RAISE EXCEPTION 'expected aborted terminal rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

-- Complete the intent through every allowed state.
UPDATE "DocumentUploadIntent" SET status = 'UPLOADING', revision = 2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-intent-1';
UPDATE "DocumentUploadIntent" SET status = 'UPLOADED', revision = 3, "uploadCompletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-intent-1';
UPDATE "DocumentUploadIntent" SET status = 'VERIFYING', revision = 4, "verificationStartedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-intent-1';
UPDATE "DocumentUploadIntent" SET status = 'QUARANTINED', revision = 5, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-intent-1';
UPDATE "DocumentUploadIntent" SET status = 'SCAN_PENDING', revision = 6, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-intent-1';

INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", side, sequence,
  "storageProviderId", "storageRegion", "storageKey", "originalFileName", "normalizedMimeType",
  "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes", "checksumSha256",
  "uploadStatus", "scanStatus", "scanProviderReference", "retentionUntil", "createdAt", "updatedAt",
  "evidenceSchemaVersion", "uploadSessionId", "uploadIntentId", "configurationReleaseId",
  "documentPolicyConfigVersionId", "documentRequirementTypeId", "slotNumber", "attemptNumber", "isCurrent",
  "storageContainerId", "declaredMimeType", "filePolicyVersion", "quarantineStatus", "quarantinedAt",
  "fileValidatorVersion", "metadataVerifiedAt", "scanAttemptCount", "scanRequestedAt", "retentionBasis",
  "retentionBasisAt", "retentionPolicyDaysSnapshot", "hardRetentionDaysSnapshot", "deletionEligibleAt"
) VALUES (
  'p8-document-1', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 1,
  'local-private', 'local-test', 'opaque-approved-1', 'synthetic.jpg', 'image/jpeg', 'image/jpeg', 'JPEG', '.jpg', 128, repeat('b',64),
  'VERIFYING', 'PENDING', 'scan-request-1', CURRENT_TIMESTAMP + interval '90 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  2, 'p8-session', 'p8-intent-1', 'p8-release', 'p8-documents', 'document-type-driving-licence', 1, 1, true,
  'phase8c', 'image/jpeg', 1, 'QUARANTINED', CURRENT_TIMESTAMP, 'phase8-validator-v1', CURRENT_TIMESTAMP,
  0, CURRENT_TIMESTAMP, 'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365, CURRENT_TIMESTAMP + interval '90 days'
);

BEGIN;
INSERT INTO "DocumentMalwareScanAttempt" (
  id, "customerDocumentId", "attemptNumber", "scannerProviderId", "providerReference", "providerEventId",
  "startedAt", "completedAt", outcome, "safeResultCode", retryable, "sanitizedMetadata"
) VALUES (
  'p8-scan-1', 'p8-document-1', 1, 'fake-scanner', 'scan-request-1', 'scan-event-1',
  CURRENT_TIMESTAMP - interval '1 second', CURRENT_TIMESTAMP, 'CLEAN', 'CLEAN', false, '{"engine":"fake-v1"}'::jsonb
);
UPDATE "CustomerDocument" SET "scanStatus" = 'CLEAN', "scanAttemptCount" = 1, "scanCompletedAt" = CURRENT_TIMESTAMP,
  "scanResultCode" = 'CLEAN', "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-document-1';
COMMIT;

UPDATE "DocumentUploadIntent" SET status = 'CLEAN', revision = 7, "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-intent-1';
UPDATE "CustomerDocument" SET "uploadStatus" = 'READY', "quarantineStatus" = 'RELEASED',
  "releasedFromQuarantineAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-document-1';

DO $$
BEGIN
  BEGIN
    UPDATE "DocumentMalwareScanAttempt" SET "safeResultCode" = 'CHANGED' WHERE id = 'p8-scan-1';
    RAISE EXCEPTION 'expected append-only scan rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    INSERT INTO "DocumentMalwareScanAttempt" (
      id, "customerDocumentId", "attemptNumber", "scannerProviderId", "providerReference", "providerEventId",
      "startedAt", "completedAt", outcome, retryable
    ) VALUES ('p8-scan-duplicate', 'p8-document-1', 2, 'fake-scanner', 'scan-request-2', 'scan-event-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'CLEAN', false);
    RAISE EXCEPTION 'expected duplicate callback rejection';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE "DocumentUploadIntent" SET status = 'FAILED', "failureCode" = 'LATE_FAILURE', "completedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-intent-1';
    RAISE EXCEPTION 'expected duplicate completion/terminal rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    UPDATE "CustomerDocument" SET "replacesDocumentId" = id WHERE id = 'p8-document-1';
    RAISE EXCEPTION 'expected replacement self-reference rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

-- Hold application requires matching summary state and remains historical after release.
BEGIN;
INSERT INTO "DocumentLegalHold" (
  id, "customerDocumentId", reason, "appliedById", "appliedAt", "reviewAt", revision, "updatedAt"
) VALUES ('p8-hold-1', 'p8-document-1', 'Synthetic incident preservation', 'p8-officer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 day', 1, CURRENT_TIMESTAMP);
UPDATE "CustomerDocument" SET "legalHold" = true, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-document-1';
COMMIT;

DO $$
BEGIN
  BEGIN
    INSERT INTO "DocumentLegalHold" (id, "customerDocumentId", reason, "appliedById", "updatedAt")
    VALUES ('p8-hold-duplicate', 'p8-document-1', 'Duplicate', 'p8-officer', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'expected one-active-hold rejection';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "DocumentDeletionRequest" (
      id, "customerDocumentId", "idempotencyKey", "requestedById", reason, "eligibleAt", "mustCompleteBy", "updatedAt"
    ) VALUES ('p8-delete-held', 'p8-document-1', 'p8-delete-held', 'p8-officer', 'Held deletion', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '7 days', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'expected held deletion rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

BEGIN;
UPDATE "DocumentLegalHold" SET "releasedById" = 'p8-officer', "releasedAt" = CURRENT_TIMESTAMP,
  "releaseReason" = 'Synthetic release', revision = 2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-hold-1';
UPDATE "CustomerDocument" SET "legalHold" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-document-1';
COMMIT;

INSERT INTO "DocumentDeletionRequest" (
  id, "customerDocumentId", "idempotencyKey", "requestedById", reason, "eligibleAt", "mustCompleteBy", status, revision, "updatedAt"
) VALUES (
  'p8-delete-1', 'p8-document-1', 'p8-delete-idempotency-1', 'p8-officer', 'Synthetic retention deletion',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '7 days', 'SCHEDULED', 1, CURRENT_TIMESTAMP
);
UPDATE "CustomerDocument" SET "deletionStatus" = 'SCHEDULED', "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-document-1';
UPDATE "DocumentDeletionRequest" SET status = 'IN_PROGRESS', revision = 2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-delete-1';

DO $$
BEGIN
  BEGIN
    INSERT INTO "DocumentDeletionRequest" (
      id, "customerDocumentId", "idempotencyKey", "requestedById", reason, "eligibleAt", "mustCompleteBy", "updatedAt"
    ) VALUES ('p8-delete-duplicate', 'p8-document-1', 'p8-delete-idempotency-1', 'p8-officer', 'Duplicate', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '7 days', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'expected deletion idempotency rejection';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE "DocumentDeletionRequest" SET status = 'COMPLETED', revision = 3, "completedAt" = CURRENT_TIMESTAMP,
      "providerConfirmedAt" = CURRENT_TIMESTAMP, "providerConfirmationRef" = 'missing-attempt', "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-delete-1';
    RAISE EXCEPTION 'expected verified-outcome rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

INSERT INTO "DocumentDeletionAttempt" (
  id, "deletionRequestId", "attemptNumber", "storageProviderId", "providerRequestId", "startedAt", "completedAt",
  outcome, retryable, "providerConfirmationRef"
) VALUES (
  'p8-delete-attempt-1', 'p8-delete-1', 1, 'local-private', 'delete-request-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  'DELETED', false, 'delete-confirmation-1'
);

DO $$
BEGIN
  BEGIN
    UPDATE "DocumentDeletionAttempt" SET "providerConfirmationRef" = 'changed' WHERE id = 'p8-delete-attempt-1';
    RAISE EXCEPTION 'expected append-only deletion attempt rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    INSERT INTO "DocumentDeletionAttempt" (
      id, "deletionRequestId", "attemptNumber", "storageProviderId", "providerRequestId", "startedAt", "completedAt",
      outcome, retryable, "providerConfirmationRef"
    ) VALUES ('p8-delete-attempt-duplicate', 'p8-delete-1', 1, 'local-private', 'delete-request-2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'DELETED', false, 'delete-confirmation-2');
    RAISE EXCEPTION 'expected duplicate deletion attempt rejection';
  EXCEPTION WHEN unique_violation OR raise_exception THEN NULL;
  END;
END;
$$;

UPDATE "DocumentDeletionRequest" SET status = 'COMPLETED', revision = 3, "completedAt" = CURRENT_TIMESTAMP,
  "providerConfirmedAt" = CURRENT_TIMESTAMP, "providerConfirmationRef" = 'delete-confirmation-1', "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-delete-1';
UPDATE "CustomerDocument" SET "deletionStatus" = 'DELETED', "deletedAt" = CURRENT_TIMESTAMP,
  "deletionReason" = 'RETENTION_EXPIRED', "isCurrent" = false, "quarantineStatus" = 'DELETED', "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-document-1';

-- Replacement-slot uniqueness and monotonic predecessor rules make cycles impossible.
INSERT INTO "DocumentUploadIntent" (
  id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
  "idempotencyKey", "filePolicyVersion", "normalizedExtension", "declaredMimeType", "expectedSizeBytes",
  "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId", "storageKey", "providerUploadId",
  status, revision, "expiresAt", "cleanupEligibleAt", "uploadCompletedAt", "verificationStartedAt", "createdAt", "updatedAt"
) VALUES
  ('p8-cycle-intent-2', 'p8-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 2,
   'p8-cycle-idem-2', 1, '.jpg', 'image/jpeg', 128, repeat('c',64), 'local-private', 'local-test', 'phase8c',
   'opaque-cycle-2', 'provider-cycle-2', 'QUARANTINED', 1, CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-cycle-intent-3', 'p8-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 3,
   'p8-cycle-idem-3', 1, '.jpg', 'image/jpeg', 128, repeat('d',64), 'local-private', 'local-test', 'phase8c',
   'opaque-cycle-3', 'provider-cycle-3', 'QUARANTINED', 1, CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", side, sequence, "storageProviderId", "storageRegion", "storageKey",
  "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes", "checksumSha256",
  "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt", "evidenceSchemaVersion", "uploadSessionId",
  "uploadIntentId", "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "slotNumber",
  "attemptNumber", "isCurrent", "storageContainerId", "declaredMimeType", "filePolicyVersion", "quarantineStatus",
  "quarantinedAt", "fileValidatorVersion", "metadataVerifiedAt", "scanAttemptCount", "scanRequestedAt", "retentionBasis",
  "retentionBasisAt", "retentionPolicyDaysSnapshot", "hardRetentionDaysSnapshot", "deletionEligibleAt"
) VALUES (
  'p8-cycle-a', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 2, 'local-private', 'local-test', 'opaque-cycle-approved-2',
  'image/jpeg', 'image/jpeg', 'JPEG', '.jpg', 128, repeat('c',64), 'VERIFYING', 'PENDING', CURRENT_TIMESTAMP + interval '90 days',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 'p8-session', 'p8-cycle-intent-2', 'p8-release', 'p8-documents',
  'document-type-driving-licence', 1, 2, true, 'phase8c', 'image/jpeg', 1, 'QUARANTINED', CURRENT_TIMESTAMP,
  'phase8-validator-v1', CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP, 'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365,
  CURRENT_TIMESTAMP + interval '90 days'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO "CustomerDocument" (
      id, "customerUserId", "uploadedById", "documentTypeId", side, sequence, "storageProviderId", "storageRegion", "storageKey",
      "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes", "checksumSha256",
      "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt", "evidenceSchemaVersion", "uploadSessionId",
      "uploadIntentId", "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "slotNumber",
      "attemptNumber", "isCurrent", "storageContainerId", "declaredMimeType", "filePolicyVersion", "quarantineStatus",
      "quarantinedAt", "fileValidatorVersion", "metadataVerifiedAt", "scanAttemptCount", "scanRequestedAt", "retentionBasis",
      "retentionBasisAt", "retentionPolicyDaysSnapshot", "hardRetentionDaysSnapshot", "deletionEligibleAt"
    ) VALUES (
      'p8-slot-duplicate', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 3, 'local-private', 'local-test', 'opaque-cycle-approved-3',
      'image/jpeg', 'image/jpeg', 'JPEG', '.jpg', 128, repeat('d',64), 'VERIFYING', 'PENDING', CURRENT_TIMESTAMP + interval '90 days',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 'p8-session', 'p8-cycle-intent-3', 'p8-release', 'p8-documents',
      'document-type-driving-licence', 1, 3, true, 'phase8c', 'image/jpeg', 1, 'QUARANTINED', CURRENT_TIMESTAMP,
      'phase8-validator-v1', CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP, 'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365,
      CURRENT_TIMESTAMP + interval '90 days'
    );
    RAISE EXCEPTION 'expected one-current-slot rejection';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE "CustomerDocument" SET "uploadSessionId" = 'p8-expired-session', "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-cycle-a';
    RAISE EXCEPTION 'expected invalid provenance rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

UPDATE "CustomerDocument" SET "isCurrent" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-cycle-a';
INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", side, sequence, "storageProviderId", "storageRegion", "storageKey",
  "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes", "checksumSha256",
  "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt", "evidenceSchemaVersion", "uploadSessionId",
  "uploadIntentId", "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "slotNumber",
  "attemptNumber", "isCurrent", "replacesDocumentId", "storageContainerId", "declaredMimeType", "filePolicyVersion",
  "quarantineStatus", "quarantinedAt", "fileValidatorVersion", "metadataVerifiedAt", "scanAttemptCount", "scanRequestedAt",
  "retentionBasis", "retentionBasisAt", "retentionPolicyDaysSnapshot", "hardRetentionDaysSnapshot", "deletionEligibleAt"
) VALUES (
  'p8-cycle-b', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 3, 'local-private', 'local-test', 'opaque-cycle-approved-3',
  'image/jpeg', 'image/jpeg', 'JPEG', '.jpg', 128, repeat('d',64), 'VERIFYING', 'PENDING', CURRENT_TIMESTAMP + interval '90 days',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 'p8-session', 'p8-cycle-intent-3', 'p8-release', 'p8-documents',
  'document-type-driving-licence', 1, 3, false, 'p8-cycle-a', 'phase8c', 'image/jpeg', 1, 'QUARANTINED', CURRENT_TIMESTAMP,
  'phase8-validator-v1', CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP, 'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365,
  CURRENT_TIMESTAMP + interval '90 days'
);

DO $$
BEGIN
  BEGIN
    UPDATE "CustomerDocument" SET "replacesDocumentId" = 'p8-cycle-b', "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8-cycle-a';
    RAISE EXCEPTION 'expected replacement cycle/monotonic rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    DELETE FROM "CustomerDocument" WHERE id = 'p8-document-1';
    RAISE EXCEPTION 'expected evidence FK deletion restriction';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END;
$$;

-- Restricted roles/capability are seeded without an assignment to the legacy ADMIN.
DO $$
DECLARE admin_sensitive integer; restricted_assignments integer;
BEGIN
  SELECT count(*) INTO admin_sensitive
  FROM "UserAccessRole" assignment
  JOIN "AccessRole" role ON role.id = assignment."accessRoleId"
  WHERE assignment."userId" = 'p8-admin' AND role.key IN (
    'DOCUMENT_REVIEWER', 'DOCUMENT_DOWNLOADER', 'DOCUMENT_RETENTION_OPERATOR', 'DOCUMENT_LEGAL_HOLD_OFFICER'
  );
  SELECT count(*) INTO restricted_assignments
  FROM "UserAccessRole" assignment JOIN "AccessRole" role ON role.id = assignment."accessRoleId"
  WHERE role.key IN ('DOCUMENT_REVIEWER', 'DOCUMENT_DOWNLOADER', 'DOCUMENT_RETENTION_OPERATOR', 'DOCUMENT_LEGAL_HOLD_OFFICER');
  IF admin_sensitive <> 0 OR restricted_assignments <> 0 THEN
    RAISE EXCEPTION 'Restricted document roles were assigned automatically';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Capability" WHERE key = 'documents.legal-hold.manage') THEN
    RAISE EXCEPTION 'Missing legal-hold capability';
  END IF;
END;
$$;

-- Final evidence assertions.
DO $$
BEGIN
  IF (SELECT "evidenceSchemaVersion" FROM "CustomerDocument" WHERE id = 'p8-legacy-document') <> 1 OR
     (SELECT "configurationReleaseId" FROM "CustomerDocument" WHERE id = 'p8-legacy-document') IS NOT NULL THEN
    RAISE EXCEPTION 'Historical document evidence was fabricated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "DocumentLegalHold" WHERE id = 'p8-hold-1' AND "releasedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Legal hold release history was not preserved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "CustomerDocument" WHERE id = 'p8-document-1' AND "deletionStatus" = 'DELETED' AND "deletedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Verified deletion tombstone was not retained';
  END IF;
END;
$$;
