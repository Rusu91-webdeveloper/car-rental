-- Idempotent compatibility backfill for an already-migrated database.
-- It creates one inactive DRAFT FleetRateSet only when eligible legacy Cars exist.
-- It never changes Car.price, Booking, weekly/monthly prices, or release activation.

DO $$
DECLARE
  admin_user_id text;
  currency_code text;
  eligible_car_count integer;
  mismatch_count integer;
BEGIN
  SELECT count(*) INTO eligible_car_count FROM "Car" WHERE "isDeleted" = false;
  IF eligible_car_count = 0 THEN
    RAISE NOTICE 'No eligible Cars found; compatibility FleetRateSet was not required.';
    RETURN;
  END IF;

  SELECT id INTO admin_user_id
  FROM "User"
  WHERE role = 'ADMIN' AND "isActive" = true
  ORDER BY "createdAt", id
  LIMIT 1;

  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Compatibility rate backfill requires an existing active ADMIN actor';
  END IF;

  SELECT upper(currency) INTO currency_code
  FROM "CompanySettings"
  WHERE id = 'company-settings';
  currency_code := COALESCE(currency_code, 'EUR');
  IF currency_code !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'CompanySettings currency must be a three-letter code before rate backfill';
  END IF;

  INSERT INTO "FleetRateSet" (
    id, "versionNumber", status, "validationStatus", "schemaVersion", revision,
    currency, "changeSummary", "createdById", "updatedById", "createdAt", "updatedAt"
  ) VALUES (
    'fleet-rate-set-compat-v1', 1, 'DRAFT', 'NOT_VALIDATED', 1, 1,
    currency_code, 'Compatibility draft copied from legacy Car.price; inactive and daily-only.',
    admin_user_id, admin_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM "FleetRateSet"
    WHERE id = 'fleet-rate-set-compat-v1'
      AND status = 'DRAFT'
      AND "activatedAt" IS NULL
      AND currency = currency_code
  ) THEN
    RAISE EXCEPTION 'Existing compatibility FleetRateSet does not match the safe inactive draft contract';
  END IF;

  INSERT INTO "VehicleRentalRate" (
    id, "fleetRateSetId", "carId", "dailyRate", "weeklyRate", "monthlyRate",
    "weeklyRateEnabled", "monthlyRateEnabled", "createdAt"
  )
  SELECT
    'compat-rate-' || md5(car.id), 'fleet-rate-set-compat-v1', car.id, car.price,
    NULL, NULL, false, false, CURRENT_TIMESTAMP
  FROM "Car" car
  WHERE car."isDeleted" = false
  ON CONFLICT ("fleetRateSetId", "carId") DO NOTHING;

  SELECT count(*) INTO mismatch_count
  FROM "Car" car
  LEFT JOIN "VehicleRentalRate" rate
    ON rate."carId" = car.id AND rate."fleetRateSetId" = 'fleet-rate-set-compat-v1'
  WHERE car."isDeleted" = false
    AND (
      rate.id IS NULL OR rate."dailyRate" <> car.price OR
      rate."weeklyRate" IS NOT NULL OR rate."monthlyRate" IS NOT NULL OR
      rate."weeklyRateEnabled" OR rate."monthlyRateEnabled"
    );

  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'Compatibility rate backfill verification failed for % Cars', mismatch_count;
  END IF;
END;
$$;
