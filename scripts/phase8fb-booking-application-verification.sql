\set ON_ERROR_STOP on

-- Phase 8F-B disposable PostgreSQL verification. Run after the complete migration
-- chain and phase8fb-booking-application-fixture.sql. No document bytes are used.

-- The aggregate refuses release-derived values that do not exactly match the release.
DO $$
BEGIN
  BEGIN
    INSERT INTO "BookingApplication" (
      id, "customerUserId", "carId", locale, "pickupAt", "returnAt", "pickupLocation", "returnLocation",
      "businessTimeZone", "idempotencyKey", "configurationReleaseId", "generalRentalConfigVersionId",
      "pricingBillingConfigVersionId", "fleetRateSetId", "insuranceConfigVersionId",
      "customerDriverConfigVersionId", "bookingWorkflowConfigVersionId", "documentPolicyConfigVersionId",
      "paymentConfigVersionId", "confirmationConfigVersionId", "legalAcceptanceConfigVersionId",
      "paymentMethod", "expiresAt", "updatedAt"
    ) VALUES (
      'p8fb-bad-provenance', 'p8-customer', 'p8-car', 'en', '2035-01-01T10:00:00Z', '2035-01-02T10:00:00Z',
      'Bucharest Airport', 'Bucharest Airport', 'Wrong/Zone', 'p8fb-bad-provenance', 'p8-release',
      'p8-general', 'p8-pricing', 'p8-rates', 'p8-insurance', 'p8-customer', 'p8-workflow', 'p8-documents',
      'p8-payments', 'p8-confirmations', 'p8-legal', 'TRANSFER', CURRENT_TIMESTAMP + interval '30 minutes', CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'expected application release provenance rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

INSERT INTO "BookingApplication" (
  id, "customerUserId", "carId", locale, "pickupAt", "returnAt", "pickupLocation", "returnLocation",
  "businessTimeZone", "idempotencyKey", "configurationReleaseId", "generalRentalConfigVersionId",
  "pricingBillingConfigVersionId", "fleetRateSetId", "insuranceConfigVersionId",
  "customerDriverConfigVersionId", "bookingWorkflowConfigVersionId", "documentPolicyConfigVersionId",
  "paymentConfigVersionId", "confirmationConfigVersionId", "legalAcceptanceConfigVersionId",
  "paymentMethod", "expiresAt", "updatedAt"
) VALUES (
  'p8fb-application', 'p8-customer', 'p8-car', 'en', '2035-01-01T10:00:00Z', '2035-01-02T10:00:00Z',
  'Bucharest Airport', 'Bucharest Airport', 'Europe/Bucharest', 'p8fb-idempotency', 'p8-release',
  'p8-general', 'p8-pricing', 'p8-rates', 'p8-insurance', 'p8-customer', 'p8-workflow', 'p8-documents',
  'p8-payments', 'p8-confirmations', 'p8-legal', 'TRANSFER', CURRENT_TIMESTAMP + interval '30 minutes', CURRENT_TIMESTAMP
);

UPDATE "DocumentUploadSession"
SET "bookingApplicationId" = 'p8fb-application', revision = 2, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8-session';

INSERT INTO "BookingApplicationCustomerDriver" (
  id, "bookingApplicationId", "customerDriverConfigVersionId", "firstName", "lastName", email,
  "licenceNumber", "licenceHeldSinceDate", "validationStatus", "validatorVersion", "validatedAt", "updatedAt"
) VALUES (
  'p8fb-driver', 'p8fb-application', 'p8-customer', 'Synthetic', 'Customer', 'customer@phase8.invalid',
  'SYNTHETIC-LICENCE', '2020-01-01', 'VALID', 'phase8fb-validator-v1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "BookingApplicationInsuranceSelection" (
  id, "bookingApplicationId", "insuranceConfigVersionId", selected, "requirementMode", "customerFacingName",
  "unitPrice", "billableDays", "quotedSubtotal", currency, "taxTreatment", "availabilityScope",
  "customerSelectionShown", preselected, "showInConfirmation", "selectedAt", "updatedAt"
) VALUES (
  'p8fb-insurance', 'p8fb-application', 'p8-insurance', false, 'DISABLED', 'No configured insurance',
  0, 1, 0, 'EUR', 'INHERIT_RENTAL', 'ALL_VEHICLES', false, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "BookingApplicationPaymentSelection" (
  id, "bookingApplicationId", "paymentConfigVersionId", "bookingPaymentMethod", "configuredPaymentMode",
  "depositType", "depositValue", "quotedDepositAmount", currency, "selectedAt", "updatedAt"
) VALUES (
  'p8fb-payment', 'p8fb-application', 'p8-payments', 'TRANSFER', 'BANK_TRANSFER',
  'NONE', 0, 0, 'EUR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "BookingApplicationPricingQuote" (
  id, "bookingApplicationId", "quoteVersion", "configurationReleaseId", "pricingConfigVersionId",
  "fleetRateSetId", "vehicleRentalRateId", "releaseNumber", "pricingVersionNumber", "fleetRateSetVersionNumber",
  "pricingEngineVersion", "rateSourceType", "rateSourceReference", "mixedDurationStrategy", currency,
  "chargeableDurationMinutes", "chargeableDays", "billableDayMethod", "rentalMonthDefinition",
  "dailyUnits", "weeklyUnits", "monthlyUnits", "sourceDailyRate", "baseSubtotal", "grandTotal",
  "calculatedAt", "expiresAt", "calculationTrace", "requiresCustomerConfirmation"
) VALUES (
  'p8fb-quote-1', 'p8fb-application', 1, 'p8-release', 'p8-pricing', 'p8-rates', 'p8-rate', 81, 81, 81,
  'phase8fb-pricing-v1', 'FLEET_RATE_SET', 'p8-rate', 'DAILY_ONLY', 'EUR', 1440, 1,
  'STARTED_24_HOUR_PERIODS', 'FIXED_30_DAYS', 1, 0, 0, 10000, 10000, 10000,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '20 minutes', '{}'::jsonb, true
);

INSERT INTO "BookingApplicationLegalAcceptance" (
  id, "bookingApplicationId", "legalDocumentVersionId", "legalDocumentTranslationId", "customerUserId",
  "configurationReleaseId", "legalAcceptanceConfigVersionId", "documentType", "documentVersionNumber",
  locale, "contentHash", accepted, source, "contentSnapshot", "acceptanceRound"
) VALUES
  ('p8fb-accept-terms-1', 'p8fb-application', 'p8-terms', 'p8fb-terms-en', 'p8-customer',
   'p8-release', 'p8-legal', 'RENTAL_TERMS', 81, 'en', repeat('1', 64), true, 'CUSTOMER_CHECKBOX',
   'Synthetic terms content.', 1),
  ('p8fb-accept-privacy-1', 'p8fb-application', 'p8-privacy', 'p8fb-privacy-en', 'p8-customer',
   'p8-release', 'p8-legal', 'PRIVACY_NOTICE', 81, 'en', repeat('2', 64), true, 'CUSTOMER_CHECKBOX',
   'Synthetic privacy content.', 1);

DO $$
BEGIN
  BEGIN
    UPDATE "BookingApplicationLegalAcceptance" SET "contentSnapshot" = 'changed' WHERE id = 'p8fb-accept-terms-1';
    RAISE EXCEPTION 'expected append-only legal acceptance rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

UPDATE "BookingApplication"
SET status = 'AWAITING_DOCUMENT_UPLOAD', revision = 2, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8fb-application' AND revision = 1;
UPDATE "BookingApplication"
SET status = 'AWAITING_DOCUMENT_REVIEW', revision = 3, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8fb-application' AND revision = 2;

-- The current quote exists but is not customer-confirmed, so READY is rejected.
DO $$
BEGIN
  BEGIN
    UPDATE "BookingApplication"
    SET status = 'READY_TO_FINALIZE', revision = 4, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = 'p8fb-application' AND revision = 3;
    RAISE EXCEPTION 'expected unconfirmed quote readiness rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

UPDATE "BookingApplicationPricingQuote"
SET "confirmedAt" = CURRENT_TIMESTAMP - interval '1 day', "confirmedByUserId" = 'p8-customer'
WHERE id = 'p8fb-quote-1';

UPDATE "BookingApplication"
SET status = 'READY_TO_FINALIZE', revision = 4, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8fb-application' AND revision = 3;

-- Price changes preserve the old quote and require a newly confirmed current quote.
UPDATE "BookingApplication"
SET status = 'CUSTOMER_ACTION_REQUIRED', revision = 5, "actionRequiredReason" = 'PRICE_CHANGED',
    "actionRequiredAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8fb-application' AND revision = 4;
UPDATE "BookingApplicationPricingQuote" SET "isCurrent" = false WHERE id = 'p8fb-quote-1';
INSERT INTO "BookingApplicationPricingQuote" (
  id, "bookingApplicationId", "quoteVersion", "supersedesPricingQuoteId", "configurationReleaseId",
  "pricingConfigVersionId", "fleetRateSetId", "vehicleRentalRateId", "releaseNumber", "pricingVersionNumber",
  "fleetRateSetVersionNumber", "pricingEngineVersion", "rateSourceType", "rateSourceReference",
  "mixedDurationStrategy", currency, "chargeableDurationMinutes", "chargeableDays", "billableDayMethod",
  "rentalMonthDefinition", "dailyUnits", "sourceDailyRate", "baseSubtotal", "grandTotal", "calculatedAt",
  "expiresAt", "calculationTrace", "requiresCustomerConfirmation", "confirmedAt", "confirmedByUserId"
) VALUES (
  'p8fb-quote-2', 'p8fb-application', 2, 'p8fb-quote-1', 'p8-release', 'p8-pricing', 'p8-rates', 'p8-rate',
  81, 81, 81, 'phase8fb-pricing-v1', 'FLEET_RATE_SET', 'p8-rate', 'DAILY_ONLY', 'EUR', 1440, 1,
  'STARTED_24_HOUR_PERIODS', 'FIXED_30_DAYS', 1, 10000, 10000, 10000, CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + interval '20 minutes', '{"reason":"renewed"}'::jsonb, true, CURRENT_TIMESTAMP, 'p8-customer'
);
UPDATE "BookingApplication"
SET status = 'READY_TO_FINALIZE', revision = 6, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8fb-application' AND revision = 5;

DO $$
BEGIN
  BEGIN
    UPDATE "BookingApplication" SET revision = 6, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = 'p8fb-application';
    RAISE EXCEPTION 'expected stale application revision rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

-- Two independent connections race the same optimistic finalization claim.
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('p8fb-finalize-a', 'dbname=' || current_database());
SELECT dblink_connect('p8fb-finalize-b', 'dbname=' || current_database());
SELECT dblink_send_query('p8fb-finalize-a',
  'UPDATE "BookingApplication" SET status = ''FINALIZING'', revision = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ''p8fb-application'' AND status = ''READY_TO_FINALIZE'' AND revision = 6 RETURNING id');
SELECT dblink_send_query('p8fb-finalize-b',
  'UPDATE "BookingApplication" SET status = ''FINALIZING'', revision = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ''p8fb-application'' AND status = ''READY_TO_FINALIZE'' AND revision = 6 RETURNING id');
CREATE TEMP TABLE p8fb_finalize_results (id text);
INSERT INTO p8fb_finalize_results SELECT id FROM dblink_get_result('p8fb-finalize-a') AS result(id text);
INSERT INTO p8fb_finalize_results SELECT id FROM dblink_get_result('p8fb-finalize-b') AS result(id text);
SELECT dblink_disconnect('p8fb-finalize-a');
SELECT dblink_disconnect('p8fb-finalize-b');

DO $$
BEGIN
  IF (SELECT count(*) FROM p8fb_finalize_results) <> 1 OR
     (SELECT status FROM "BookingApplication" WHERE id = 'p8fb-application') <> 'FINALIZING' THEN
    RAISE EXCEPTION 'Concurrent finalization did not produce exactly one winner';
  END IF;
END;
$$;

-- The winner atomically creates the authoritative booking and consumes the session.
BEGIN;
INSERT INTO "Booking" (
  id, "bookingNumber", "transferCode", locale, "userId", "carId", "pickupDate", "dropoffDate", location,
  "pricePerDay", "totalDays", "totalPrice", "depositAmount", "guaranteeAmount", status, "paymentStatus",
  "paymentMethod", "createdAt", "updatedAt"
) VALUES (
  'p8fb-booking', 'P8FB-BOOKING', 'P8FB-TRANSFER', 'en', 'p8-customer', 'p8-car',
  '2035-01-01T10:00:00Z', '2035-01-02T10:00:00Z', 'Bucharest Airport', 10000, 1, 10000, 0, 0,
  'PENDING', 'PENDING', 'TRANSFER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "BookingPricingSnapshot" (
  id, "bookingId", "configurationReleaseId", "pricingConfigVersionId", "fleetRateSetId", "vehicleRentalRateId",
  "releaseNumber", "pricingVersionNumber", "fleetRateSetVersionNumber", "pricingEngineVersion", "compatibilityMode",
  "rateSourceType", "rateSourceReference", "mixedDurationStrategy", currency, "chargeableDurationMinutes",
  "chargeableDays", "billableDayMethod", "rentalMonthDefinition", "dailyUnits", "sourceDailyRate",
  "baseSubtotal", "grandTotal", "calculatedAt", "calculationTrace"
) VALUES (
  'p8fb-booking-price', 'p8fb-booking', 'p8-release', 'p8-pricing', 'p8-rates', 'p8-rate', 81, 81, 81,
  'phase8fb-pricing-v1', false, 'FLEET_RATE_SET', 'p8-rate', 'DAILY_ONLY', 'EUR', 1440, 1,
  'STARTED_24_HOUR_PERIODS', 'FIXED_30_DAYS', 1, 10000, 10000, 10000, CURRENT_TIMESTAMP,
  '{"source":"p8fb-quote-2"}'::jsonb
);

INSERT INTO "BookingCustomerDriverSnapshot" (
  id, "bookingId", "customerDriverConfigVersionId", "firstName", "lastName", email, "licenceNumber",
  "licenceHeldSinceDate", "capturedAt", "validatedAt"
) VALUES (
  'p8fb-booking-driver', 'p8fb-booking', 'p8-customer', 'Synthetic', 'Customer', 'customer@phase8.invalid',
  'SYNTHETIC-LICENCE', '2020-01-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "BookingInsuranceSnapshot" (
  id, "bookingId", "insuranceConfigVersionId", selected, "requirementMode", "customerFacingName", "unitPrice",
  "billableDays", subtotal, currency, "taxTreatment", "availabilityScope", "customerSelectionShown", preselected,
  "showInConfirmation", "capturedAt"
) VALUES (
  'p8fb-booking-insurance', 'p8fb-booking', 'p8-insurance', false, 'DISABLED', 'No configured insurance', 0,
  1, 0, 'EUR', 'INHERIT_RENTAL', 'ALL_VEHICLES', false, false, true, CURRENT_TIMESTAMP
);

INSERT INTO "BookingLegalAcceptance" (
  id, "bookingId", "legalDocumentTranslationId", "customerUserId", "configurationReleaseId",
  "legalAcceptanceConfigVersionId", "documentType", "documentVersionNumber", locale, "contentHash", accepted,
  "acceptedAt", source, "contentSnapshot"
) VALUES
  ('p8fb-booking-terms', 'p8fb-booking', 'p8fb-terms-en', 'p8-customer', 'p8-release', 'p8-legal',
   'RENTAL_TERMS', 81, 'en', repeat('1', 64), true, CURRENT_TIMESTAMP, 'CUSTOMER_CHECKBOX', 'Synthetic terms content.'),
  ('p8fb-booking-privacy', 'p8fb-booking', 'p8fb-privacy-en', 'p8-customer', 'p8-release', 'p8-legal',
   'PRIVACY_NOTICE', 81, 'en', repeat('2', 64), true, CURRENT_TIMESTAMP, 'CUSTOMER_CHECKBOX', 'Synthetic privacy content.');

UPDATE "BookingApplication"
SET "bookingId" = 'p8fb-booking', revision = 8, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8fb-application' AND status = 'FINALIZING' AND revision = 7;
UPDATE "DocumentUploadSession"
SET status = 'CONSUMED', "bookingId" = 'p8fb-booking', "consumedAt" = CURRENT_TIMESTAMP,
    revision = 3, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8-session' AND status = 'OPEN' AND revision = 2;
UPDATE "BookingApplication"
SET status = 'FINALIZED', revision = 9, "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8fb-application' AND status = 'FINALIZING' AND revision = 8;
COMMIT;

DO $$
BEGIN
  IF (SELECT status FROM "BookingApplication" WHERE id = 'p8fb-application') <> 'FINALIZED' OR
     (SELECT count(*) FROM "BookingApplicationPricingQuote" WHERE "bookingApplicationId" = 'p8fb-application') <> 2 OR
     (SELECT count(*) FROM "BookingApplicationLegalAcceptance" WHERE "bookingApplicationId" = 'p8fb-application') <> 2 OR
     (SELECT status FROM "DocumentUploadSession" WHERE id = 'p8-session') <> 'CONSUMED' OR
     (SELECT "bookingId" FROM "BookingApplication" WHERE id = 'p8fb-application') <> 'p8fb-booking' THEN
    RAISE EXCEPTION 'Phase 8F-B final evidence is inconsistent';
  END IF;
  BEGIN
    UPDATE "BookingApplication" SET revision = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'p8fb-application';
    RAISE EXCEPTION 'expected finalized application immutability rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

-- Expiry is authoritative even if a bound upload session itself remains open.
INSERT INTO "BookingApplication" (
  id, "customerUserId", "carId", locale, "pickupAt", "returnAt", "pickupLocation", "returnLocation",
  "businessTimeZone", "idempotencyKey", "configurationReleaseId", "generalRentalConfigVersionId",
  "pricingBillingConfigVersionId", "fleetRateSetId", "insuranceConfigVersionId",
  "customerDriverConfigVersionId", "bookingWorkflowConfigVersionId", "documentPolicyConfigVersionId",
  "paymentConfigVersionId", "confirmationConfigVersionId", "legalAcceptanceConfigVersionId",
  "paymentMethod", "expiresAt", "updatedAt"
) VALUES (
  'p8fb-expiring-application', 'p8-customer', 'p8-car', 'en', '2035-02-01T10:00:00Z', '2035-02-02T10:00:00Z',
  'Bucharest Airport', 'Bucharest Airport', 'Europe/Bucharest', 'p8fb-expiring-idempotency', 'p8-release',
  'p8-general', 'p8-pricing', 'p8-rates', 'p8-insurance', 'p8-customer', 'p8-workflow', 'p8-documents',
  'p8-payments', 'p8-confirmations', 'p8-legal', 'TRANSFER', CURRENT_TIMESTAMP + interval '500 milliseconds', CURRENT_TIMESTAMP
);
INSERT INTO "DocumentUploadSession" (
  id, "customerUserId", "carId", "pickupAt", "returnAt", locale, "configurationReleaseId",
  "documentPolicyConfigVersionId", "bookingApplicationId", status, revision, "expiresAt", "createdAt", "updatedAt"
) VALUES (
  'p8fb-expiring-session', 'p8-customer', 'p8-car', '2035-02-01T10:00:00Z', '2035-02-02T10:00:00Z', 'en',
  'p8-release', 'p8-documents', 'p8fb-expiring-application', 'OPEN', 1,
  CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
SELECT pg_sleep(0.6);
UPDATE "BookingApplication"
SET status = 'EXPIRED', revision = 2, "terminalReason" = 'APPLICATION_TTL_ELAPSED', "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p8fb-expiring-application' AND revision = 1;

DO $$
BEGIN
  BEGIN
    INSERT INTO "DocumentUploadIntent" (
      id, "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber",
      "idempotencyKey", "filePolicyVersion", "originalFileName", "normalizedExtension", "declaredMimeType",
      "expectedSizeBytes", "expectedChecksumSha256", "storageProviderId", "storageRegion", "storageContainerId",
      "storageKey", status, revision, "expiresAt", "cleanupEligibleAt", "createdAt", "updatedAt"
    ) VALUES (
      'p8fb-expired-intent', 'p8fb-expiring-session', 'p8-documents', 'document-type-driving-licence', 'SINGLE', 1, 1,
      'p8fb-expired-upload', 1, 'synthetic.jpg', '.jpg', 'image/jpeg', 128, repeat('c', 64),
      'local-private', 'local-test', 'phase8fb', 'opaque-expired', 'INTENT_CREATED', 1,
      CURRENT_TIMESTAMP + interval '10 minutes', CURRENT_TIMESTAMP + interval '20 minutes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'expected expired application upload rejection';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$$;

SELECT 'Phase 8F-B application lifecycle, evidence, expiry guards, quote renewal, concurrency, and finalization passed.' AS result;
