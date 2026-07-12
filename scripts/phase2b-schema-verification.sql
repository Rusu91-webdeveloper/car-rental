-- Executable schema verification for a disposable PostgreSQL database only.
-- Run after the complete migration chain and the compatibility backfill.

CREATE OR REPLACE FUNCTION pg_temp.assert_true(value boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Assertion failed: %', message;
  END IF;
END;
$$;

-- The migration seeds stable vocabularies and legacy ADMIN compatibility mappings.
SELECT pg_temp.assert_true((SELECT count(*) = 14 FROM "Capability"), 'all Phase 1 capabilities are seeded');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM "AccessRole" WHERE key = 'ADMIN_COMPAT'), 'ADMIN_COMPAT role exists');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM "UserAccessRole" WHERE "userId" = 'phase2b-admin'), 'legacy ADMIN mapping exists');
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM "DocumentTypeDefinition"), 'document type reference data exists');
SELECT pg_temp.assert_true((SELECT count(*) = 8 FROM "ConfirmationSectionDefinition"), 'confirmation section reference data exists');
SELECT pg_temp.assert_true((SELECT array_agg(key ORDER BY key) = ARRAY['DRIVING_LICENCE','IDENTITY_CARD','PASSPORT'] FROM "DocumentTypeDefinition"), 'document type keys match application contracts');
SELECT pg_temp.assert_true((SELECT array_agg(key ORDER BY key) = ARRAY['COMPANY_CONTACT','CUSTOMER_DETAILS','DOCUMENT_REMINDERS','INSURANCE','LEGAL_REFERENCES','PAYMENT','PICKUP_RETURN','PRICING'] FROM "ConfirmationSectionDefinition"), 'confirmation section keys match application contracts');

-- Compatibility backfill is inactive, daily-only, complete, and did not mutate legacy data.
SELECT pg_temp.assert_true((SELECT price = 12345 FROM "Car" WHERE id = 'phase2b-car'), 'Car.price is unchanged');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM "BusinessConfigurationRelease"), 'backfill created no release');
SELECT pg_temp.assert_true((SELECT status = 'DRAFT' AND "activatedAt" IS NULL FROM "FleetRateSet" WHERE id = 'fleet-rate-set-compat-v1'), 'rate set is an inactive draft');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM "VehicleRentalRate" WHERE "fleetRateSetId" = 'fleet-rate-set-compat-v1' AND "dailyRate" = 12345 AND "weeklyRate" IS NULL AND "monthlyRate" IS NULL AND NOT "weeklyRateEnabled" AND NOT "monthlyRateEnabled"), 'daily-only rate was copied exactly once');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM "Booking" WHERE id = 'phase2b-booking'), 'legacy Booking remains valid');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM "BookingPricingSnapshot" WHERE "bookingId" = 'phase2b-booking'), 'legacy Booking requires no snapshot');

-- Create legal drafts used only by this verification.
INSERT INTO "LegalDocumentVersion" (id, type, "versionNumber", status, "schemaVersion", revision, "versionLabel", "changeSummary", "createdById", "updatedById", "createdAt", "updatedAt") VALUES
  ('phase2b-terms', 'RENTAL_TERMS', 1, 'DRAFT', 1, 1, 'test-terms-v1', 'Disposable verification terms.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase2b-privacy', 'PRIVACY_NOTICE', 1, 'DRAFT', 1, 1, 'test-privacy-v1', 'Disposable verification privacy.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "LegalDocumentTranslation" (id, "legalDocumentVersionId", locale, title, "canonicalContent", "contentHash", "createdAt", "updatedAt") VALUES
  ('phase2b-terms-de', 'phase2b-terms', 'de', 'Terms', 'Terms content', repeat('a', 64), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase2b-privacy-de', 'phase2b-privacy', 'de', 'Privacy', 'Privacy content', repeat('b', 64), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Every approved domain can be created as a draft. Metadata and its one typed payload
-- are committed atomically because the payload/domain check is deferred.
BEGIN;
INSERT INTO "ConfigurationVersion" (id, domain, "versionNumber", status, "validationStatus", "schemaVersion", revision, "changeSummary", "createdById", "updatedById", "createdAt", "updatedAt") VALUES
  ('cfg-general', 'GENERAL_RENTAL', 1, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'General test draft.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cfg-pricing', 'PRICING_BILLING', 1, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Pricing test draft.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cfg-insurance', 'INSURANCE', 1, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Insurance test draft.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cfg-customer', 'CUSTOMER_DRIVER_REQUIREMENTS', 1, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Customer test draft.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cfg-workflow', 'BOOKING_WORKFLOW', 1, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Workflow test draft.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cfg-documents', 'DOCUMENT_POLICY', 1, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Document test draft.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cfg-payments', 'PAYMENTS', 1, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Payment test draft.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cfg-confirmations', 'CONFIRMATIONS', 1, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Confirmation test draft.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cfg-legal', 'LEGAL_ACCEPTANCE', 1, 'DRAFT', 'NOT_VALIDATED', 1, 1, 'Legal acceptance test draft.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "GeneralRentalConfigVersion" VALUES ('cfg-general', 'Europe/Berlin', 'EUR', ARRAY['de']);
INSERT INTO "PricingBillingConfigVersion" ("configurationVersionId") VALUES ('cfg-pricing');
INSERT INTO "InsuranceConfigVersion" ("configurationVersionId") VALUES ('cfg-insurance');
INSERT INTO "CustomerDriverConfigVersion" ("configurationVersionId", "allowedLicenceCountries") VALUES ('cfg-customer', ARRAY[]::text[]);
INSERT INTO "BookingWorkflowConfigVersion" VALUES ('cfg-workflow');
INSERT INTO "DocumentPolicyConfigVersion" VALUES ('cfg-documents', 90);
INSERT INTO "PaymentConfigVersion" ("configurationVersionId", "defaultMethod", "confirmationMode") VALUES ('cfg-payments', 'BANK_TRANSFER', 'REQUIRES_REVIEW');
INSERT INTO "ConfirmationConfigVersion" VALUES ('cfg-confirmations');
INSERT INTO "LegalAcceptanceConfigVersion" ("configurationVersionId", "termsDocumentVersionId", "privacyDocumentVersionId") VALUES ('cfg-legal', 'phase2b-terms', 'phase2b-privacy');
COMMIT;

SELECT pg_temp.assert_true((SELECT count(*) = 9 FROM "ConfigurationVersion" WHERE status = 'DRAFT'), 'all nine typed drafts were created');

-- Draft payloads remain editable.
UPDATE "GeneralRentalConfigVersion" SET "businessTimeZone" = 'Europe/Bucharest' WHERE "configurationVersionId" = 'cfg-general';
SELECT pg_temp.assert_true((SELECT "businessTimeZone" = 'Europe/Bucharest' FROM "GeneralRentalConfigVersion" WHERE "configurationVersionId" = 'cfg-general'), 'draft payload remains editable');

DO $$
BEGIN
  BEGIN
    INSERT INTO "ConfigurationVersion" (id, domain, "versionNumber", "changeSummary", "createdById", "updatedById", "createdAt", "updatedAt")
    VALUES ('cfg-general-duplicate', 'GENERAL_RENTAL', 1, 'Duplicate.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'duplicate domain version number unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO "VehicleRentalRate" (id, "fleetRateSetId", "carId", "dailyRate") VALUES ('duplicate-rate', 'fleet-rate-set-compat-v1', 'phase2b-car', 12345);
    RAISE EXCEPTION 'duplicate vehicle rate unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO "BusinessConfigurationRelease" (id, "releaseNumber", name, "changeSummary", "createdById", "updatedById", "createdAt", "updatedAt")
    VALUES ('incomplete-release', 99, 'Incomplete', 'Must fail.', 'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'incomplete release unexpectedly succeeded';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
END;
$$;

-- Publish/release test records; transition itself is allowed.
UPDATE "LegalDocumentVersion" SET status = 'PUBLISHED', "publishedById" = 'phase2b-admin', "publishedAt" = CURRENT_TIMESTAMP WHERE id IN ('phase2b-terms', 'phase2b-privacy');
UPDATE "ConfigurationVersion" SET status = 'RELEASED', "validationStatus" = 'VALID', "validatedById" = 'phase2b-admin', "validatedAt" = CURRENT_TIMESTAMP, "activatedAt" = CURRENT_TIMESTAMP WHERE id LIKE 'cfg-%';
UPDATE "FleetRateSet" SET status = 'RELEASED', "validationStatus" = 'VALID', "validatedById" = 'phase2b-admin', "activatedById" = 'phase2b-admin', "validatedAt" = CURRENT_TIMESTAMP, "activatedAt" = CURRENT_TIMESTAMP WHERE id = 'fleet-rate-set-compat-v1';

INSERT INTO "BusinessConfigurationRelease" (
  id, "releaseNumber", status, "validationStatus", revision, name, "changeSummary",
  "generalRentalConfigVersionId", "pricingBillingConfigVersionId", "fleetRateSetId",
  "insuranceConfigVersionId", "customerDriverConfigVersionId", "bookingWorkflowConfigVersionId",
  "documentPolicyConfigVersionId", "paymentConfigVersionId", "confirmationConfigVersionId",
  "legalAcceptanceConfigVersionId", "createdById", "updatedById", "validatedById", "activatedById",
  "createdAt", "updatedAt", "validatedAt", "activatedAt"
) VALUES (
  'phase2b-release', 1, 'ACTIVE', 'VALID', 1, 'Disposable active release', 'Verification only.',
  'cfg-general', 'cfg-pricing', 'fleet-rate-set-compat-v1', 'cfg-insurance', 'cfg-customer', 'cfg-workflow',
  'cfg-documents', 'cfg-payments', 'cfg-confirmations', 'cfg-legal', 'phase2b-admin', 'phase2b-admin',
  'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

DO $$
BEGIN
  BEGIN
    INSERT INTO "BusinessConfigurationRelease" (
      id, "releaseNumber", status, "validationStatus", name, "changeSummary",
      "generalRentalConfigVersionId", "pricingBillingConfigVersionId", "fleetRateSetId",
      "insuranceConfigVersionId", "customerDriverConfigVersionId", "bookingWorkflowConfigVersionId",
      "documentPolicyConfigVersionId", "paymentConfigVersionId", "confirmationConfigVersionId",
      "legalAcceptanceConfigVersionId", "createdById", "updatedById", "validatedById", "activatedById",
      "createdAt", "updatedAt", "validatedAt", "activatedAt"
    ) VALUES (
      'phase2b-release-2', 2, 'ACTIVE', 'VALID', 'Second active', 'Must fail.',
      'cfg-general', 'cfg-pricing', 'fleet-rate-set-compat-v1', 'cfg-insurance', 'cfg-customer', 'cfg-workflow',
      'cfg-documents', 'cfg-payments', 'cfg-confirmations', 'cfg-legal', 'phase2b-admin', 'phase2b-admin',
      'phase2b-admin', 'phase2b-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'second active release unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

-- Immutability checks.
DO $$
BEGIN
  BEGIN UPDATE "ConfigurationVersion" SET "changeSummary" = 'changed' WHERE id = 'cfg-general'; RAISE EXCEPTION 'released configuration metadata mutation succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'released configuration metadata%' THEN RAISE; END IF; END;
  BEGIN UPDATE "GeneralRentalConfigVersion" SET currency = 'USD' WHERE "configurationVersionId" = 'cfg-general'; RAISE EXCEPTION 'released domain mutation succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'released domain mutation%' THEN RAISE; END IF; END;
  BEGIN UPDATE "FleetRateSet" SET "changeSummary" = 'changed' WHERE id = 'fleet-rate-set-compat-v1'; RAISE EXCEPTION 'released fleet metadata mutation succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'released fleet metadata%' THEN RAISE; END IF; END;
  BEGIN UPDATE "VehicleRentalRate" SET "dailyRate" = 1 WHERE "fleetRateSetId" = 'fleet-rate-set-compat-v1'; RAISE EXCEPTION 'released rate mutation succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'released rate mutation%' THEN RAISE; END IF; END;
  BEGIN UPDATE "BusinessConfigurationRelease" SET name = 'changed' WHERE id = 'phase2b-release'; RAISE EXCEPTION 'active release mutation succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'active release mutation%' THEN RAISE; END IF; END;
  BEGIN UPDATE "LegalDocumentVersion" SET "versionLabel" = 'changed' WHERE id = 'phase2b-terms'; RAISE EXCEPTION 'published legal mutation succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'published legal mutation%' THEN RAISE; END IF; END;
  BEGIN UPDATE "LegalDocumentTranslation" SET title = 'changed' WHERE id = 'phase2b-terms-de'; RAISE EXCEPTION 'published translation mutation succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'published translation mutation%' THEN RAISE; END IF; END;
END;
$$;

-- Snapshot/evidence uniqueness and append-only behavior.
INSERT INTO "BookingPricingSnapshot" (
  id, "bookingId", "configurationReleaseId", "pricingConfigVersionId", "fleetRateSetId", "vehicleRentalRateId",
  "releaseNumber", "pricingVersionNumber", "fleetRateSetVersionNumber", "pricingEngineVersion", currency,
  "chargeableDurationMinutes", "chargeableDays", "billableDayMethod", "rentalMonthDefinition", "dailyUnits",
  "sourceDailyRate", "baseSubtotal", "grandTotal", "calculatedAt"
) SELECT
  'phase2b-pricing-snapshot', 'phase2b-booking', 'phase2b-release', 'cfg-pricing', 'fleet-rate-set-compat-v1', rate.id,
  1, 1, 1, 'verification-v1', 'EUR', 1440, 1, 'STARTED_24_HOUR_PERIODS', 'FIXED_30_DAYS', 1,
  12345, 12345, 12345, CURRENT_TIMESTAMP
FROM "VehicleRentalRate" rate WHERE rate."fleetRateSetId" = 'fleet-rate-set-compat-v1';

INSERT INTO "BookingCustomerDriverSnapshot" (id, "bookingId", "firstName", "lastName", email, "capturedAt") VALUES ('phase2b-customer-snapshot', 'phase2b-booking', 'Test', 'Customer', 'test@example.invalid', CURRENT_TIMESTAMP);
INSERT INTO "BookingInsuranceSnapshot" (id, "bookingId", "insuranceConfigVersionId", selected, "requirementMode", "customerFacingName", "unitPrice", "billableDays", subtotal, "taxTreatment", "capturedAt") VALUES ('phase2b-insurance-snapshot', 'phase2b-booking', 'cfg-insurance', false, 'DISABLED', 'Insurance', 0, 1, 0, 'INHERIT_RENTAL', CURRENT_TIMESTAMP);
INSERT INTO "BookingLegalAcceptance" (id, "bookingId", "legalDocumentTranslationId", "customerUserId", "documentType", "documentVersionNumber", locale, "contentHash", accepted, "acceptedAt", source) VALUES ('phase2b-acceptance', 'phase2b-booking', 'phase2b-terms-de', 'phase2b-user', 'RENTAL_TERMS', 1, 'de', repeat('a', 64), true, CURRENT_TIMESTAMP, 'CUSTOMER_CHECKBOX');

DO $$
BEGIN
  BEGIN INSERT INTO "BookingPricingSnapshot" (id, "bookingId", "configurationReleaseId", "pricingConfigVersionId", "fleetRateSetId", "vehicleRentalRateId", "releaseNumber", "pricingVersionNumber", "fleetRateSetVersionNumber", "pricingEngineVersion", currency, "chargeableDurationMinutes", "chargeableDays", "billableDayMethod", "rentalMonthDefinition", "sourceDailyRate", "baseSubtotal", "grandTotal", "calculatedAt") SELECT 'duplicate-snapshot', 'phase2b-booking', 'phase2b-release', 'cfg-pricing', 'fleet-rate-set-compat-v1', id, 1, 1, 1, 'v1', 'EUR', 1440, 1, 'STARTED_24_HOUR_PERIODS', 'FIXED_30_DAYS', 12345, 12345, 12345, CURRENT_TIMESTAMP FROM "VehicleRentalRate" LIMIT 1; RAISE EXCEPTION 'duplicate snapshot succeeded';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO "BookingLegalAcceptance" (id, "bookingId", "legalDocumentTranslationId", "documentType", "documentVersionNumber", locale, "contentHash", accepted, "acceptedAt", source) VALUES ('duplicate-acceptance', 'phase2b-booking', 'phase2b-terms-de', 'RENTAL_TERMS', 1, 'de', repeat('a',64), true, CURRENT_TIMESTAMP, 'CUSTOMER_CHECKBOX'); RAISE EXCEPTION 'duplicate acceptance succeeded';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN UPDATE "BookingPricingSnapshot" SET "grandTotal" = 1 WHERE id = 'phase2b-pricing-snapshot'; RAISE EXCEPTION 'snapshot update succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'snapshot update%' THEN RAISE; END IF; END;
  BEGIN DELETE FROM "BookingCustomerDriverSnapshot" WHERE id = 'phase2b-customer-snapshot'; RAISE EXCEPTION 'snapshot delete succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'snapshot delete%' THEN RAISE; END IF; END;
  BEGIN UPDATE "BookingInsuranceSnapshot" SET selected = true WHERE id = 'phase2b-insurance-snapshot'; RAISE EXCEPTION 'insurance snapshot update succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'insurance snapshot update%' THEN RAISE; END IF; END;
  BEGIN UPDATE "BookingLegalAcceptance" SET accepted = false WHERE id = 'phase2b-acceptance'; RAISE EXCEPTION 'acceptance update succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'acceptance update%' THEN RAISE; END IF; END;
END;
$$;

INSERT INTO "AuditEvent" (id, category, action, "targetType", "targetId") VALUES ('phase2b-audit', 'SYSTEM', 'phase2b.verification', 'test', 'phase2b');
DO $$
BEGIN
  BEGIN UPDATE "AuditEvent" SET action = 'changed' WHERE id = 'phase2b-audit'; RAISE EXCEPTION 'audit update succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'audit update%' THEN RAISE; END IF; END;
  BEGIN DELETE FROM "AuditEvent" WHERE id = 'phase2b-audit'; RAISE EXCEPTION 'audit delete succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'audit delete%' THEN RAISE; END IF; END;
  BEGIN INSERT INTO "RoleCapability" ("accessRoleId", "capabilityId") SELECT role.id, capability.id FROM "AccessRole" role CROSS JOIN "Capability" capability WHERE role.key = 'ADMIN_COMPAT' LIMIT 1; RAISE EXCEPTION 'duplicate role capability succeeded';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN DELETE FROM "User" WHERE id = 'phase2b-admin'; RAISE EXCEPTION 'restrict delete succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END;
$$;

SELECT 'phase2b schema verification passed' AS result;
