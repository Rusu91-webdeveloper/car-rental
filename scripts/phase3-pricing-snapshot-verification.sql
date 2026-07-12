\set ON_ERROR_STOP on

-- Synthetic disposable-database verification only. Run after the complete migration chain.
INSERT INTO "User" (id, email, name, role, "isActive", "createdAt", "updatedAt")
VALUES ('phase3-user', 'phase3@example.invalid', 'Phase 3 Synthetic User', 'USER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "CompanySettings" (id, currency, "taxRate", "taxIncluded", "depositPercentage", "guaranteePercentage", "updatedAt")
VALUES ('company-settings', 'EUR', 0, false, 0.2, 0, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET currency = EXCLUDED.currency;

INSERT INTO "Car" (
  id, slug, name, description, category, price, image, status, gearbox, seats,
  "fuelType", acceleration, "createdAt", "updatedAt"
) VALUES (
  'phase3-car', 'phase3-synthetic-car', 'Phase 3 Synthetic Car',
  'Synthetic fixture for pricing snapshot verification only.', 'SEDAN', 12345,
  'https://example.invalid/phase3-car.jpg', 'AVAILABLE', 'Automatic', 5,
  'Electric', '5.0sec', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Existing bookings remain readable without a pricing snapshot.
INSERT INTO "Booking" (
  id, "bookingNumber", "transferCode", locale, "userId", "carId", "pickupDate", "dropoffDate",
  location, "pricePerDay", "totalDays", "totalPrice", "depositAmount", "guaranteeAmount",
  status, "paymentStatus", "paymentMethod", "createdAt", "updatedAt"
) VALUES (
  'phase3-legacy-booking', 'PHASE3-LEGACY', 'P3LEGACY', 'en', 'phase3-user', 'phase3-car',
  CURRENT_TIMESTAMP + INTERVAL '10 days', CURRENT_TIMESTAMP + INTERVAL '11 days',
  'Synthetic location', 12345, 1, 13580, 2716, 0,
  'PENDING', 'PENDING', 'TRANSFER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- A snapshot failure inside the booking transaction rolls back the booking as well.
DO $$
BEGIN
  BEGIN
    INSERT INTO "Booking" (
      id, "bookingNumber", "transferCode", locale, "userId", "carId", "pickupDate", "dropoffDate",
      location, "pricePerDay", "totalDays", "totalPrice", "depositAmount", "guaranteeAmount",
      status, "paymentStatus", "paymentMethod", "createdAt", "updatedAt"
    ) VALUES (
      'phase3-atomic-rollback', 'PHASE3-ROLLBACK', 'P3ROLLBK', 'en', 'phase3-user', 'phase3-car',
      CURRENT_TIMESTAMP + INTERVAL '20 days', CURRENT_TIMESTAMP + INTERVAL '21 days',
      'Synthetic location', 12345, 1, 13580, 2716, 0,
      'PENDING', 'PENDING', 'TRANSFER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );

    INSERT INTO "BookingPricingSnapshot" (
      id, "bookingId", "snapshotSchemaVersion", "pricingEngineVersion", "compatibilityMode",
      "rateSourceType", "rateSourceReference", "mixedDurationStrategy", currency,
      "chargeableDurationMinutes", "chargeableDays", "billableDayMethod", "rentalMonthDefinition",
      "dailyUnits", "weeklyUnits", "monthlyUnits", "sourceDailyRate", "baseSubtotal",
      "insuranceSubtotal", "adjustmentTotal", "taxTotal", "grandTotal", "calculatedAt"
    ) VALUES (
      'phase3-invalid-snapshot', 'phase3-atomic-rollback', 1, 'pricing-engine-v1', true,
      'FLEET_RATE_SET', 'phase3-car', 'DAILY_ONLY', 'EUR', 1440, 1,
      'STARTED_24_HOUR_PERIODS', 'FIXED_30_DAYS', 1, 0, 0, 12345, 12345, 0, 0, 1235, 13580,
      CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Expected compatibility provenance constraint rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  IF EXISTS (SELECT 1 FROM "Booking" WHERE id = 'phase3-atomic-rollback') THEN
    RAISE EXCEPTION 'Booking was not rolled back with failed snapshot';
  END IF;
END $$;

BEGIN;
INSERT INTO "Booking" (
  id, "bookingNumber", "transferCode", locale, "userId", "carId", "pickupDate", "dropoffDate",
  location, "pricePerDay", "totalDays", "totalPrice", "depositAmount", "guaranteeAmount",
  status, "paymentStatus", "paymentMethod", "createdAt", "updatedAt"
) VALUES (
  'phase3-priced-booking', 'PHASE3-PRICED', 'P3PRICED', 'en', 'phase3-user', 'phase3-car',
  CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP + INTERVAL '31 days',
  'Synthetic location', 12345, 1, 13580, 2716, 0,
  'PENDING', 'PENDING', 'TRANSFER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "BookingPricingSnapshot" (
  id, "bookingId", "snapshotSchemaVersion", "pricingEngineVersion", "compatibilityMode",
  "rateSourceType", "rateSourceReference", "mixedDurationStrategy", currency,
  "chargeableDurationMinutes", "chargeableDays", "billableDayMethod", "rentalMonthDefinition",
  "dailyUnits", "weeklyUnits", "monthlyUnits", "sourceDailyRate", "baseSubtotal",
  "insuranceSubtotal", "adjustmentTotal", "taxTotal", "grandTotal", "calculatedAt", "calculationTrace"
) VALUES (
  'phase3-valid-snapshot', 'phase3-priced-booking', 1, 'pricing-engine-v1', true,
  'CAR_PRICE', 'phase3-car', 'DAILY_ONLY', 'EUR', 1440, 1,
  'STARTED_24_HOUR_PERIODS', 'FIXED_30_DAYS', 1, 0, 0, 12345, 12345, 0, 0, 1235, 13580,
  CURRENT_TIMESTAMP, '{"compatibilityMode":"LEGACY_CAR_PRICE"}'::jsonb
);
COMMIT;

DO $$
BEGIN
  IF (SELECT price FROM "Car" WHERE id = 'phase3-car') <> 12345 THEN
    RAISE EXCEPTION 'Car.price changed during Phase 3 verification';
  END IF;
  IF EXISTS (SELECT 1 FROM "BusinessConfigurationRelease" WHERE status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Phase 3 verification must not activate a release';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "Booking" b
    JOIN "BookingPricingSnapshot" s ON s."bookingId" = b.id
    WHERE b.id = 'phase3-priced-booking'
      AND b."totalPrice" = s."grandTotal"
      AND b."pricePerDay" = s."sourceDailyRate"
      AND s."compatibilityMode" = true
      AND s."configurationReleaseId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Atomic compatibility booking/snapshot verification failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Booking" b
    LEFT JOIN "BookingPricingSnapshot" s ON s."bookingId" = b.id
    WHERE b.id = 'phase3-legacy-booking' AND s.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Legacy booking without snapshot is not readable';
  END IF;
END $$;

SELECT 'phase3 pricing snapshot verification passed' AS result;
