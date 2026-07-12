\set ON_ERROR_STOP on

-- Run only after scripts/phase4-representative-fixture.sql and before the Phase 6 migration.
-- Synthetic records use example.invalid identities in disposable PostgreSQL only.
BEGIN;
UPDATE "ConfigurationVersion"
SET status = 'RELEASED', "validationStatus" = 'VALID', "validatedAt" = CURRENT_TIMESTAMP, "activatedAt" = CURRENT_TIMESTAMP
WHERE id LIKE 'p4-%';
UPDATE "FleetRateSet"
SET status = 'RELEASED', "validationStatus" = 'VALID', "validatedAt" = CURRENT_TIMESTAMP, "activatedAt" = CURRENT_TIMESTAMP
WHERE id = 'p4-rates';
UPDATE "BusinessConfigurationRelease"
SET status = 'ACTIVE', "validationStatus" = 'VALID', "validatedAt" = CURRENT_TIMESTAMP,
    "activatedAt" = CURRENT_TIMESTAMP, "activatedById" = 'p4-admin'
WHERE id = 'p4-release-1';
COMMIT;

INSERT INTO "Booking" (
  id, "bookingNumber", "transferCode", locale, "userId", "carId", "pickupDate", "dropoffDate", location,
  "pricePerDay", "totalDays", "totalPrice", "depositAmount", status, "paymentStatus", "paymentMethod", "createdAt", "updatedAt"
) VALUES (
  'p6-release-booking', 'P6-RELEASE', 'P6REL', 'en', 'p4-manager', 'p4-car',
  CURRENT_TIMESTAMP + INTERVAL '20 days', CURRENT_TIMESTAMP + INTERVAL '22 days', 'Synthetic',
  10000, 2, 20000, 0, 'PENDING', 'PENDING', 'PAY_AT_PICKUP', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
), (
  'p6-legacy-booking', 'P6-LEGACY', 'P6LEG', 'en', 'p4-manager', 'p4-car',
  CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP + INTERVAL '31 days', 'Synthetic',
  10000, 1, 10000, 0, 'PENDING', 'PENDING', 'PAY_AT_PICKUP', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "BookingPricingSnapshot" (
  id, "bookingId", "pricingEngineVersion", "compatibilityMode", "configurationReleaseId", "releaseNumber",
  "pricingConfigVersionId", "fleetRateSetId", "vehicleRentalRateId", "rateSourceType", "rateSourceReference",
  "pricingVersionNumber", "fleetRateSetVersionNumber",
  "mixedDurationStrategy", currency, "chargeableDurationMinutes", "chargeableDays", "billableDayMethod",
  "rentalMonthDefinition", "dailyUnits", "sourceDailyRate", "baseSubtotal", "grandTotal", "calculatedAt"
) VALUES (
  'p6-release-pricing', 'p6-release-booking', 'pricing-engine-v1', false, 'p4-release-1', 1,
  'p4-pricing', 'p4-rates', 'p4-rate', 'FLEET_RATE_SET', 'p4-rate', 1, 10, 'DAILY_ONLY',
  'EUR', 2880, 2, 'STARTED_24_HOUR_PERIODS', 'FIXED_30_DAYS', 2, 10000, 20000, 20000, CURRENT_TIMESTAMP
), (
  'p6-legacy-pricing', 'p6-legacy-booking', 'pricing-engine-v1', true, NULL, NULL,
  NULL, NULL, NULL, 'CAR_PRICE', 'p4-car', NULL, NULL, 'DAILY_ONLY',
  'EUR', 1440, 1, 'STARTED_24_HOUR_PERIODS', 'FIXED_30_DAYS', 1, 10000, 10000, 10000, CURRENT_TIMESTAMP
);

INSERT INTO "BookingCustomerDriverSnapshot" (
  id, "bookingId", "firstName", "lastName", email, "capturedAt"
) VALUES
  ('p6-release-customer', 'p6-release-booking', 'Synthetic', 'Release', 'release@example.invalid', CURRENT_TIMESTAMP),
  ('p6-legacy-customer', 'p6-legacy-booking', 'Synthetic', 'Legacy', 'legacy@example.invalid', CURRENT_TIMESTAMP);

INSERT INTO "BookingInsuranceSnapshot" (
  id, "bookingId", "insuranceConfigVersionId", selected, "requirementMode", "customerFacingName",
  "unitPrice", "billableDays", subtotal, "taxTreatment", "capturedAt"
) VALUES (
  'p6-release-insurance', 'p6-release-booking', 'p4-insurance', false, 'DISABLED', 'Insurance',
  0, 2, 0, 'INHERIT_RENTAL', CURRENT_TIMESTAMP
);
