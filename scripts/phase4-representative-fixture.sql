\set ON_ERROR_STOP on

-- Synthetic Phase 4 integration fixture. Disposable PostgreSQL only.
INSERT INTO "User" (id, email, name, role, "isActive", "createdAt", "updatedAt") VALUES
  ('p4-admin', 'p4-admin@example.invalid', 'Phase 4 Admin', 'ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-manager', 'p4-manager@example.invalid', 'Phase 4 Manager', 'USER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-no-cap', 'p4-no-cap@example.invalid', 'Phase 4 No Capability', 'USER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "AccessRole" (id, key, name, status, "isSystem", "updatedAt")
VALUES ('p4-manager-role', 'P4_MANAGER', 'Phase 4 configuration manager', 'ACTIVE', false, CURRENT_TIMESTAMP);
INSERT INTO "RoleCapability" ("accessRoleId", "capabilityId")
SELECT 'p4-manager-role', id FROM "Capability"
WHERE key IN ('configuration.view', 'configuration.validate', 'configuration.activate', 'security.audit.view');
INSERT INTO "UserAccessRole" ("userId", "accessRoleId") VALUES ('p4-manager', 'p4-manager-role');

INSERT INTO "CompanySettings" (id, currency, "taxIncluded", "updatedAt")
VALUES ('company-settings', 'EUR', true, CURRENT_TIMESTAMP);
INSERT INTO "Car" (
  id, slug, name, description, category, price, image, status, gearbox, seats,
  "fuelType", acceleration, "createdAt", "updatedAt"
) VALUES (
  'p4-car', 'p4-car', 'Phase 4 Test Car', 'Synthetic Phase 4 car.', 'SEDAN', 10000,
  'https://example.invalid/p4.jpg', 'AVAILABLE', 'Automatic', 5, 'Electric', '5sec',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "LegalDocumentVersion" (
  id, type, "versionNumber", status, "versionLabel", "changeSummary", "createdById", "updatedById",
  "publishedById", "publishedAt", "createdAt", "updatedAt"
) VALUES
  ('p4-terms', 'RENTAL_TERMS', 1, 'DRAFT', 'p4-terms-v1', 'Synthetic terms.', 'p4-admin', 'p4-admin', NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-privacy', 'PRIVACY_NOTICE', 1, 'DRAFT', 'p4-privacy-v1', 'Synthetic privacy.', 'p4-admin', 'p4-admin', NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "LegalDocumentTranslation" (
  id, "legalDocumentVersionId", locale, title, "canonicalContent", "contentHash", "createdAt", "updatedAt"
) VALUES
  ('p4-terms-de', 'p4-terms', 'de', 'Mietbedingungen', 'Synthetic terms DE', repeat('a',64), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-terms-en', 'p4-terms', 'en', 'Rental terms', 'Synthetic terms EN', repeat('b',64), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-privacy-de', 'p4-privacy', 'de', 'Datenschutz', 'Synthetic privacy DE', repeat('c',64), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-privacy-en', 'p4-privacy', 'en', 'Privacy', 'Synthetic privacy EN', repeat('d',64), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
UPDATE "LegalDocumentVersion"
SET status = 'PUBLISHED', "publishedById" = 'p4-admin', "publishedAt" = CURRENT_TIMESTAMP
WHERE id IN ('p4-terms', 'p4-privacy');

BEGIN;
INSERT INTO "ConfigurationVersion" (
  id, domain, "versionNumber", status, "validationStatus", revision, "changeSummary",
  "createdById", "updatedById", "createdAt", "updatedAt"
) VALUES
  ('p4-general', 'GENERAL_RENTAL', 1, 'DRAFT', 'NOT_VALIDATED', 1, 'General.', 'p4-admin', 'p4-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-pricing', 'PRICING_BILLING', 1, 'DRAFT', 'NOT_VALIDATED', 1, 'Pricing.', 'p4-admin', 'p4-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-insurance', 'INSURANCE', 1, 'DRAFT', 'NOT_VALIDATED', 1, 'Insurance.', 'p4-admin', 'p4-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-customer', 'CUSTOMER_DRIVER_REQUIREMENTS', 1, 'DRAFT', 'NOT_VALIDATED', 1, 'Customer.', 'p4-admin', 'p4-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-workflow', 'BOOKING_WORKFLOW', 1, 'DRAFT', 'NOT_VALIDATED', 1, 'Workflow.', 'p4-admin', 'p4-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-documents', 'DOCUMENT_POLICY', 1, 'DRAFT', 'NOT_VALIDATED', 1, 'Documents.', 'p4-admin', 'p4-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-payments', 'PAYMENTS', 1, 'DRAFT', 'NOT_VALIDATED', 1, 'Payments.', 'p4-admin', 'p4-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-confirmations', 'CONFIRMATIONS', 1, 'DRAFT', 'NOT_VALIDATED', 1, 'Confirmations.', 'p4-admin', 'p4-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('p4-legal', 'LEGAL_ACCEPTANCE', 1, 'DRAFT', 'NOT_VALIDATED', 1, 'Legal.', 'p4-admin', 'p4-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "GeneralRentalConfigVersion" VALUES ('p4-general', 'Europe/Berlin', 'EUR', ARRAY['de','en']);
INSERT INTO "PricingBillingConfigVersion" (
  "configurationVersionId", "weeklyPricingEnabled", "monthlyPricingEnabled", "mixedDurationStrategy",
  "rentalMonthDefinition", "billableDayMethod", "gracePeriodMinutes", "minimumRentalMinutes",
  "minimumChargeDays", "priceTaxTreatment", "taxRateBps"
) VALUES ('p4-pricing', false, false, 'DAILY_ONLY', 'FIXED_30_DAYS', 'STARTED_24_HOUR_PERIODS', 0, 1, 1, 'TAX_INCLUDED', 0);
INSERT INTO "InsuranceConfigVersion" ("configurationVersionId", "requirementMode", "pricePerDay")
VALUES ('p4-insurance', 'DISABLED', 0);
INSERT INTO "InsuranceConfigTranslation" (id, "insuranceConfigVersionId", locale, "customerFacingName")
VALUES ('p4-insurance-en', 'p4-insurance', 'en', 'Insurance');
INSERT INTO "CustomerDriverConfigVersion" (
  "configurationVersionId", "minimumDriverAge", "minimumLicenceHeldMonths", "allowedLicenceCountries"
) VALUES ('p4-customer', 18, 0, ARRAY[]::text[]);
INSERT INTO "CustomerFieldRule" ("customerDriverConfigVersionId", field, mode)
SELECT 'p4-customer', field::"CustomerFieldType",
  CASE WHEN field IN ('FIRST_NAME','LAST_NAME','EMAIL','DATE_OF_BIRTH') THEN 'REQUIRED'::"CustomerFieldMode" ELSE 'OPTIONAL'::"CustomerFieldMode" END
FROM unnest(ARRAY[
  'FIRST_NAME','LAST_NAME','EMAIL','PHONE','DATE_OF_BIRTH','COUNTRY','ADDRESS','CITY','POSTAL_CODE',
  'NATIONALITY','LICENCE_NUMBER','LICENCE_ISSUE_DATE','LICENCE_EXPIRY_DATE','LICENCE_ISSUING_COUNTRY'
]) field;
INSERT INTO "BookingWorkflowConfigVersion" VALUES ('p4-workflow');
INSERT INTO "BookingStepRule" ("bookingWorkflowConfigVersionId", step, mode, "displayOrder")
SELECT 'p4-workflow', step::"BookingStepType", 'REQUIRED', ordinal - 1
FROM unnest(ARRAY[
  'VEHICLE_AND_DATES','CUSTOMER_INFORMATION','DRIVER_INFORMATION','INSURANCE','DOCUMENTS',
  'LEGAL_ACCEPTANCE','PAYMENT','REVIEW','CONFIRMATION'
]) WITH ORDINALITY AS value(step, ordinal);
INSERT INTO "DocumentPolicyConfigVersion" VALUES ('p4-documents', 90);
INSERT INTO "DocumentRequirementRule" (
  "documentPolicyConfigVersionId", "documentTypeId", mode, "fileCount", sides, "uploadStage"
) VALUES ('p4-documents', 'document-type-driving-licence', 'OPTIONAL', 1, 'SINGLE_FILE', 'DURING_BOOKING');
INSERT INTO "PaymentConfigVersion" (
  "configurationVersionId", "defaultMethod", "confirmationMode", "depositType", "depositValue", "remainingBalanceRule"
) VALUES ('p4-payments', 'BANK_TRANSFER', 'REQUIRES_REVIEW', 'NONE', 0, 'NOT_APPLICABLE');
INSERT INTO "PaymentMethodRule" ("paymentConfigVersionId", method, enabled) VALUES
  ('p4-payments', 'BANK_TRANSFER', true), ('p4-payments', 'CASH_ON_PICKUP', true);
INSERT INTO "PaymentInstructionTranslation" (id, "paymentConfigVersionId", locale, instructions)
VALUES ('p4-payment-de', 'p4-payments', 'de', 'Synthetic bank instructions.');
INSERT INTO "ConfirmationConfigVersion" VALUES ('p4-confirmations');
INSERT INTO "ConfirmationSectionRule" ("confirmationConfigVersionId", "sectionDefinitionId", enabled)
SELECT 'p4-confirmations', id, true FROM "ConfirmationSectionDefinition";
INSERT INTO "ConfirmationContentTranslation" (id, "confirmationConfigVersionId", locale, heading)
VALUES ('p4-confirm-en', 'p4-confirmations', 'en', 'Booking confirmation');
INSERT INTO "LegalAcceptanceConfigVersion" (
  "configurationVersionId", "termsDocumentVersionId", "privacyDocumentVersionId",
  "termsAcceptance", "privacyAcknowledgment", "retainContentSnapshot"
) VALUES ('p4-legal', 'p4-terms', 'p4-privacy', 'REQUIRED', 'REQUIRED', true);
COMMIT;

INSERT INTO "FleetRateSet" (
  id, "versionNumber", status, "validationStatus", currency, "changeSummary", "createdById", "updatedById", "createdAt", "updatedAt"
) VALUES ('p4-rates', 10, 'DRAFT', 'NOT_VALIDATED', 'EUR', 'Synthetic rates.', 'p4-admin', 'p4-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "VehicleRentalRate" (id, "fleetRateSetId", "carId", "dailyRate")
VALUES ('p4-rate', 'p4-rates', 'p4-car', 10000);

INSERT INTO "BusinessConfigurationRelease" (
  id, "releaseNumber", status, "validationStatus", revision, name, "changeSummary",
  "generalRentalConfigVersionId", "pricingBillingConfigVersionId", "fleetRateSetId",
  "insuranceConfigVersionId", "customerDriverConfigVersionId", "bookingWorkflowConfigVersionId",
  "documentPolicyConfigVersionId", "paymentConfigVersionId", "confirmationConfigVersionId",
  "legalAcceptanceConfigVersionId", "createdById", "updatedById", "createdAt", "updatedAt"
) VALUES (
  'p4-release-1', 1, 'DRAFT', 'NOT_VALIDATED', 1, 'Phase 4 release', 'Synthetic activation fixture.',
  'p4-general', 'p4-pricing', 'p4-rates', 'p4-insurance', 'p4-customer', 'p4-workflow',
  'p4-documents', 'p4-payments', 'p4-confirmations', 'p4-legal', 'p4-admin', 'p4-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Historical compatibility snapshot must remain unchanged through activation.
INSERT INTO "Booking" (
  id, "bookingNumber", "transferCode", locale, "userId", "carId", "pickupDate", "dropoffDate", location,
  "pricePerDay", "totalDays", "totalPrice", "depositAmount", status, "paymentStatus", "paymentMethod", "createdAt", "updatedAt"
) VALUES (
  'p4-booking', 'P4-HISTORICAL', 'P4HIST', 'en', 'p4-manager', 'p4-car',
  CURRENT_TIMESTAMP + INTERVAL '10 days', CURRENT_TIMESTAMP + INTERVAL '11 days', 'Synthetic',
  10000, 1, 10000, 0, 'PENDING', 'PENDING', 'PAY_AT_PICKUP', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "BookingPricingSnapshot" (
  id, "bookingId", "pricingEngineVersion", "compatibilityMode", "rateSourceType", "rateSourceReference",
  "mixedDurationStrategy", currency, "chargeableDurationMinutes", "chargeableDays", "billableDayMethod",
  "rentalMonthDefinition", "dailyUnits", "sourceDailyRate", "baseSubtotal", "grandTotal", "calculatedAt"
) VALUES (
  'p4-historical-snapshot', 'p4-booking', 'pricing-engine-v1', true, 'CAR_PRICE', 'p4-car', 'DAILY_ONLY',
  'EUR', 1440, 1, 'STARTED_24_HOUR_PERIODS', 'FIXED_30_DAYS', 1, 10000, 10000, 10000, CURRENT_TIMESTAMP
);
