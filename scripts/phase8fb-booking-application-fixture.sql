\set ON_ERROR_STOP on

-- Standalone synthetic fixture for Phase 8F-B on a fully migrated disposable DB.
-- It stores metadata only; no document bytes or production identifiers are used.

INSERT INTO "User" (id, email, name, role, "isActive", "createdAt", "updatedAt") VALUES
  ('p8-admin', 'admin@phase8fb.invalid', 'Synthetic administrator', 'ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-customer', 'customer@phase8fb.invalid', 'Synthetic customer', 'USER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-officer', 'officer@phase8fb.invalid', 'Synthetic reviewer', 'USER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Car" (
  id, slug, name, description, category, price, image, status, gearbox, seats,
  "fuelType", acceleration, "createdAt", "updatedAt"
) VALUES (
  'p8-car', 'phase8fb-car', 'Synthetic Phase 8F-B car', 'Synthetic metadata only.', 'SEDAN', 10000,
  'https://example.invalid/phase8fb-car.jpg', 'AVAILABLE', 'Automatic', 5, 'Electric', '5 sec',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "LegalDocumentVersion" (
  id, type, "versionNumber", status, "versionLabel", "changeSummary", "createdById", "updatedById", "createdAt", "updatedAt"
) VALUES
  ('p8-terms', 'RENTAL_TERMS', 81, 'DRAFT', 'phase8fb-terms', 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8-privacy', 'PRIVACY_NOTICE', 81, 'DRAFT', 'phase8fb-privacy', 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "LegalDocumentTranslation" (
  id, "legalDocumentVersionId", locale, title, "canonicalContent", "contentHash",
  "validationStatus", "createdAt", "updatedAt"
) VALUES
  ('p8fb-terms-en', 'p8-terms', 'en', 'Synthetic terms', 'Synthetic terms content.', repeat('1', 64), 'VALID', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p8fb-privacy-en', 'p8-privacy', 'en', 'Synthetic privacy', 'Synthetic privacy content.', repeat('2', 64), 'VALID', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "LegalDocumentVersion"
SET status = 'PUBLISHED', revision = 2, "manifestHash" = repeat('a', 64), "primaryLocale" = 'en',
    "validationStatus" = 'VALID', "validatedById" = 'p8-admin', "validatedAt" = CURRENT_TIMESTAMP,
    "publishedById" = 'p8-admin', "publishedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
WHERE id IN ('p8-terms', 'p8-privacy');

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
) VALUES ('p8fb-document-instructions', 'p8-documents', 'document-type-driving-licence', 'en', 'Synthetic upload.', CURRENT_TIMESTAMP);
INSERT INTO "PaymentConfigVersion" ("configurationVersionId", "defaultMethod", "confirmationMode")
VALUES ('p8-payments', 'BANK_TRANSFER', 'REQUIRES_REVIEW');
INSERT INTO "PaymentMethodRule" ("paymentConfigVersionId", method, enabled) VALUES ('p8-payments', 'BANK_TRANSFER', true);
INSERT INTO "PaymentInstructionTranslation" (id, "paymentConfigVersionId", method, locale, instructions)
VALUES ('p8fb-payment-instructions', 'p8-payments', 'BANK_TRANSFER', 'en', 'Use the synthetic booking reference.');
INSERT INTO "ConfirmationConfigVersion" VALUES ('p8-confirmations');
INSERT INTO "ConfirmationSectionRule" ("confirmationConfigVersionId", "sectionDefinitionId", enabled)
SELECT 'p8-confirmations', id, true FROM "ConfirmationSectionDefinition";
INSERT INTO "ConfirmationContentTranslation" (id, "confirmationConfigVersionId", locale, heading, "safeContent")
VALUES ('p8fb-confirmation-en', 'p8-confirmations', 'en', 'Synthetic booking confirmed', 'Synthetic confirmation content.');
INSERT INTO "LegalAcceptanceConfigVersion" (
  "configurationVersionId", "termsDocumentVersionId", "privacyDocumentVersionId", "termsAcceptance",
  "privacyAcknowledgment", "bookingEnforcementEnabled", "requiredLocales", "retainContentSnapshot"
) VALUES ('p8-legal', 'p8-terms', 'p8-privacy', 'REQUIRED', 'REQUIRED', true, ARRAY['en'], true);
INSERT INTO "LegalAcceptanceTranslation" (
  id, "legalAcceptanceConfigVersionId", locale, "termsCheckboxLabel", "termsLinkLabel",
  "privacyCheckboxLabel", "privacyLinkLabel"
) VALUES (
  'p8fb-legal-labels', 'p8-legal', 'en', 'I accept the synthetic terms', 'Terms',
  'I acknowledge the synthetic privacy notice', 'Privacy'
);
COMMIT;

UPDATE "ConfigurationVersion"
SET status = 'RELEASED', "validationStatus" = 'VALID', revision = 2,
    "validatedById" = 'p8-admin', "validatedAt" = CURRENT_TIMESTAMP,
    "activatedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
WHERE id IN (
  'p8-general', 'p8-pricing', 'p8-insurance', 'p8-customer', 'p8-workflow',
  'p8-documents', 'p8-payments', 'p8-confirmations', 'p8-legal'
);

INSERT INTO "FleetRateSet" (
  id, "versionNumber", status, "validationStatus", currency, "changeSummary", "createdById", "updatedById", "createdAt", "updatedAt"
) VALUES ('p8-rates', 81, 'DRAFT', 'NOT_VALIDATED', 'EUR', 'Synthetic.', 'p8-admin', 'p8-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "VehicleRentalRate" (id, "fleetRateSetId", "carId", "dailyRate") VALUES ('p8-rate', 'p8-rates', 'p8-car', 10000);
UPDATE "FleetRateSet"
SET status = 'RELEASED', "validationStatus" = 'VALID', revision = 2,
    "validatedById" = 'p8-admin', "validatedAt" = CURRENT_TIMESTAMP,
    "activatedById" = 'p8-admin', "activatedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8-rates';

INSERT INTO "BusinessConfigurationRelease" (
  id, "releaseNumber", status, "validationStatus", revision, name, "changeSummary",
  "generalRentalConfigVersionId", "pricingBillingConfigVersionId", "fleetRateSetId",
  "insuranceConfigVersionId", "customerDriverConfigVersionId", "bookingWorkflowConfigVersionId",
  "documentPolicyConfigVersionId", "paymentConfigVersionId", "confirmationConfigVersionId",
  "legalAcceptanceConfigVersionId", "createdById", "updatedById", "validatedById", "activatedById",
  "validatedAt", "activatedAt", "createdAt", "updatedAt"
) VALUES (
  'p8-release', 81, 'ACTIVE', 'VALID', 1, 'Synthetic Phase 8F-B release', 'Synthetic.',
  'p8-general', 'p8-pricing', 'p8-rates', 'p8-insurance', 'p8-customer', 'p8-workflow',
  'p8-documents', 'p8-payments', 'p8-confirmations', 'p8-legal', 'p8-admin', 'p8-admin', 'p8-admin', 'p8-admin',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "DocumentUploadSession" (
  id, "customerUserId", "carId", "pickupAt", "returnAt", locale, "configurationReleaseId",
  "documentPolicyConfigVersionId", status, revision, "expiresAt", "createdAt", "updatedAt"
) VALUES (
  'p8-session', 'p8-customer', 'p8-car', '2035-01-01T10:00:00Z', '2035-01-02T10:00:00Z', 'en',
  'p8-release', 'p8-documents', 'OPEN', 1, CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "DocumentUploadIntent" (
  id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
  "idempotencyKey", "filePolicyVersion", "originalFileName", "normalizedExtension", "declaredMimeType",
  "expectedSizeBytes", "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId",
  "storageKey", "providerUploadId", status, revision, "expiresAt", "cleanupEligibleAt", "uploadCompletedAt",
  "verificationStartedAt", "completedAt", "createdAt", "updatedAt"
) VALUES (
  'p8fb-intent', 'p8-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 1,
  'p8fb-document-upload', 1, 'synthetic.jpg', '.jpg', 'image/jpeg', 128, repeat('b', 64), 'local-private',
  'local-test', 'phase8fb', 'opaque-phase8fb-document', 'provider-phase8fb', 'TECHNICALLY_VALID', 1,
  CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", side, sequence, "storageProviderId", "storageRegion",
  "storageKey", "originalFileName", "normalizedMimeType", "detectedMimeType", "detectedFileType", "fileExtension",
  "sizeBytes", "checksumSha256", "uploadStatus", "scanStatus", "retentionUntil", "createdAt", "updatedAt",
  "evidenceSchemaVersion", "uploadSessionId", "uploadIntentId", "configurationReleaseId",
  "documentPolicyConfigVersionId", "documentRequirementTypeId", "slotNumber", "attemptNumber", "isCurrent",
  "storageContainerId", "declaredMimeType", "filePolicyVersion", "quarantineStatus", "quarantinedAt",
  "fileValidatorVersion", "metadataVerifiedAt", "scanAttemptCount", "retentionBasis", "retentionBasisAt",
  "retentionPolicyDaysSnapshot", "hardRetentionDaysSnapshot", "deletionEligibleAt", "manualReviewStatus"
) VALUES (
  'p8fb-document', 'p8-customer', 'p8-customer', 'document-type-driving-licence', 'SINGLE', 1,
  'local-private', 'local-test', 'opaque-phase8fb-document', 'synthetic.jpg', 'image/jpeg', 'image/jpeg', 'JPEG', '.jpg',
  128, repeat('b', 64), 'TECHNICALLY_VALID', 'NOT_AVAILABLE', CURRENT_TIMESTAMP + interval '90 days',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 'p8-session', 'p8fb-intent', 'p8-release', 'p8-documents',
  'document-type-driving-licence', 1, 1, false, 'phase8fb', 'image/jpeg', 1, 'QUARANTINED', CURRENT_TIMESTAMP,
  'phase8fb-validator-v1', CURRENT_TIMESTAMP, 0, 'UPLOAD_SESSION_EXPIRY', CURRENT_TIMESTAMP, 90, 365,
  CURRENT_TIMESTAMP + interval '90 days', 'PENDING_REVIEW'
);

BEGIN;
INSERT INTO "CustomerDocumentReviewDecision" (
  id, "customerDocumentId", "decisionVersion", "previousStatus", decision, "reviewedById", "reviewedAt",
  "configurationReleaseId", "documentPolicyConfigVersionId", "documentRequirementTypeId", "uploadSessionId",
  "customerUserId", "slotNumber", side, "attemptNumber"
) VALUES (
  'p8fb-review', 'p8fb-document', 1, 'PENDING_REVIEW', 'APPROVED', 'p8-officer', CURRENT_TIMESTAMP,
  'p8-release', 'p8-documents', 'document-type-driving-licence', 'p8-session', 'p8-customer', 1, 'SINGLE', 1
);
UPDATE "CustomerDocument"
SET "manualReviewStatus" = 'APPROVED', "reviewRevision" = 1, "reviewedById" = 'p8-officer',
    "reviewedAt" = CURRENT_TIMESTAMP, "quarantineStatus" = 'RELEASED',
    "releasedFromQuarantineAt" = CURRENT_TIMESTAMP, "isCurrent" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8fb-document' AND "reviewRevision" = 0;
COMMIT;
