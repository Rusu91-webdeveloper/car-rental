-- Phase 6 additive provenance and insurance-selection evidence.
-- Existing append-only rows are backfilled only from exact immutable release evidence.

ALTER TABLE "InsuranceConfigVersion"
  ADD COLUMN "showCustomerSelection" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "preselectedByDefault" BOOLEAN NOT NULL DEFAULT false;

-- Existing configurations predate customer insurance selection. Preserve the
-- conservative behavior: optional offers are shown but never preselected;
-- disabled/mandatory insurance is not represented as an optional choice.
ALTER TABLE "ConfigurationVersion" DISABLE TRIGGER "ConfigurationVersion_immutable";
ALTER TABLE "InsuranceConfigVersion" DISABLE TRIGGER "InsuranceConfigVersion_immutable";
UPDATE "InsuranceConfigVersion"
SET "showCustomerSelection" = ("requirementMode" = 'OPTIONAL'),
    "preselectedByDefault" = false;
ALTER TABLE "InsuranceConfigVersion" ENABLE TRIGGER "InsuranceConfigVersion_immutable";
ALTER TABLE "ConfigurationVersion" ENABLE TRIGGER "ConfigurationVersion_immutable";

ALTER TABLE "InsuranceConfigVersion"
  ADD CONSTRAINT "InsuranceConfigVersion_selection_behavior_check" CHECK (
    ("requirementMode" = 'OPTIONAL' AND "showCustomerSelection") OR
    ("requirementMode" <> 'OPTIONAL' AND NOT "showCustomerSelection")
  ),
  ADD CONSTRAINT "InsuranceConfigVersion_preselection_check" CHECK (
    NOT "preselectedByDefault" OR
    ("requirementMode" = 'OPTIONAL' AND "showCustomerSelection")
  );

ALTER TABLE "BookingCustomerDriverSnapshot"
  ADD COLUMN "customerDriverConfigVersionId" TEXT,
  ADD COLUMN "validatedAt" TIMESTAMP(3);

ALTER TABLE "BookingInsuranceSnapshot"
  ADD COLUMN "availabilityVehicleId" TEXT,
  ADD COLUMN "currency" VARCHAR(3),
  ADD COLUMN "availabilityScope" "InsuranceAvailabilityScope",
  ADD COLUMN "customerSelectionShown" BOOLEAN,
  ADD COLUMN "preselected" BOOLEAN,
  ADD COLUMN "showInConfirmation" BOOLEAN;

-- Append-only protection is suspended only for this exact-evidence backfill.
ALTER TABLE "BookingCustomerDriverSnapshot" DISABLE TRIGGER "BookingCustomerDriverSnapshot_append_only";
UPDATE "BookingCustomerDriverSnapshot" customer_snapshot
SET "customerDriverConfigVersionId" = release."customerDriverConfigVersionId"
FROM "BookingPricingSnapshot" pricing_snapshot
JOIN "BusinessConfigurationRelease" release
  ON release.id = pricing_snapshot."configurationReleaseId"
WHERE pricing_snapshot."bookingId" = customer_snapshot."bookingId"
  AND pricing_snapshot."compatibilityMode" = false
  AND pricing_snapshot."configurationReleaseId" IS NOT NULL;
ALTER TABLE "BookingCustomerDriverSnapshot" ENABLE TRIGGER "BookingCustomerDriverSnapshot_append_only";

ALTER TABLE "BookingInsuranceSnapshot" DISABLE TRIGGER "BookingInsuranceSnapshot_append_only";
UPDATE "BookingInsuranceSnapshot" insurance_snapshot
SET currency = pricing_snapshot.currency,
    "availabilityScope" = insurance_config."availabilityScope",
    "availabilityVehicleId" = CASE
      WHEN insurance_config."availabilityScope" = 'SELECTED_VEHICLES' THEN booking."carId"
      ELSE NULL
    END,
    "customerSelectionShown" = false,
    preselected = false,
    "showInConfirmation" = insurance_config."showInConfirmation"
FROM "BookingPricingSnapshot" pricing_snapshot
JOIN "Booking" booking ON booking.id = pricing_snapshot."bookingId"
JOIN "BusinessConfigurationRelease" release
  ON release.id = pricing_snapshot."configurationReleaseId"
JOIN "GeneralRentalConfigVersion" general_config
  ON general_config."configurationVersionId" = release."generalRentalConfigVersionId"
JOIN "InsuranceConfigVersion" insurance_config
  ON insurance_config."configurationVersionId" = release."insuranceConfigVersionId"
WHERE pricing_snapshot."bookingId" = insurance_snapshot."bookingId"
  AND insurance_snapshot."insuranceConfigVersionId" = insurance_config."configurationVersionId"
  AND pricing_snapshot."compatibilityMode" = false
  AND pricing_snapshot.currency = general_config.currency
  AND (
    (insurance_config."requirementMode" = 'DISABLED' AND NOT insurance_snapshot.selected) OR
    (insurance_config."requirementMode" = 'MANDATORY' AND insurance_snapshot.selected)
  )
  AND (
    insurance_config."availabilityScope" = 'ALL_VEHICLES' OR
    EXISTS (
      SELECT 1 FROM "InsuranceVehicleAvailability" availability
      WHERE availability."insuranceConfigVersionId" = insurance_config."configurationVersionId"
        AND availability."carId" = booking."carId"
        AND availability.available = true
    )
  );
ALTER TABLE "BookingInsuranceSnapshot" ENABLE TRIGGER "BookingInsuranceSnapshot_append_only";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "BookingInsuranceSnapshot"
    WHERE currency IS NULL
       OR "availabilityScope" IS NULL
       OR "customerSelectionShown" IS NULL
       OR preselected IS NULL
       OR "showInConfirmation" IS NULL
  ) THEN
    RAISE EXCEPTION 'Existing insurance snapshots lack exact release-backed evidence; migration will not fabricate provenance';
  END IF;
END;
$$;

ALTER TABLE "BookingInsuranceSnapshot"
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN "availabilityScope" SET NOT NULL,
  ALTER COLUMN "customerSelectionShown" SET NOT NULL,
  ALTER COLUMN preselected SET NOT NULL,
  ALTER COLUMN "showInConfirmation" SET NOT NULL;

CREATE INDEX "BookingCustomerDriverSnapshot_customerDriverConfigVersionId_idx"
  ON "BookingCustomerDriverSnapshot"("customerDriverConfigVersionId");
CREATE INDEX "BookingInsuranceSnapshot_availabilityVehicleId_idx"
  ON "BookingInsuranceSnapshot"("availabilityVehicleId");

ALTER TABLE "BookingCustomerDriverSnapshot"
  ADD CONSTRAINT "BookingCustomerDriverSnapshot_customerDriverConfigVersionI_fkey"
  FOREIGN KEY ("customerDriverConfigVersionId")
  REFERENCES "CustomerDriverConfigVersion"("configurationVersionId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BookingInsuranceSnapshot"
  ADD CONSTRAINT "BookingInsuranceSnapshot_availabilityVehicleId_fkey"
  FOREIGN KEY ("availabilityVehicleId")
  REFERENCES "Car"(id)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BookingInsuranceSnapshot_currency_check" CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "BookingInsuranceSnapshot_availability_check" CHECK (
    ("availabilityScope" = 'ALL_VEHICLES' AND "availabilityVehicleId" IS NULL) OR
    ("availabilityScope" = 'SELECTED_VEHICLES' AND "availabilityVehicleId" IS NOT NULL)
  ),
  ADD CONSTRAINT "BookingInsuranceSnapshot_preselection_check" CHECK (
    NOT preselected OR "customerSelectionShown"
  ),
  ADD CONSTRAINT "BookingInsuranceSnapshot_selection_behavior_check" CHECK (
    ("requirementMode" = 'DISABLED' AND NOT selected AND NOT preselected AND NOT "customerSelectionShown") OR
    ("requirementMode" = 'MANDATORY' AND selected AND NOT "customerSelectionShown") OR
    ("requirementMode" = 'OPTIONAL' AND "customerSelectionShown")
  );

CREATE OR REPLACE FUNCTION enforce_booking_insurance_snapshot_consistency()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pricing_currency text;
  pricing_release_id text;
  pricing_compatibility boolean;
  booked_car_id text;
  release_insurance_id text;
  release_currency text;
  configured_mode "InsuranceRequirementMode";
  configured_scope "InsuranceAvailabilityScope";
  configured_selection boolean;
  configured_preselection boolean;
  configured_confirmation boolean;
BEGIN
  SELECT pricing.currency, pricing."configurationReleaseId", pricing."compatibilityMode", booking."carId"
  INTO pricing_currency, pricing_release_id, pricing_compatibility, booked_car_id
  FROM "BookingPricingSnapshot" pricing
  JOIN "Booking" booking ON booking.id = pricing."bookingId"
  WHERE pricing."bookingId" = NEW."bookingId";

  IF pricing_currency IS NULL THEN
    RAISE EXCEPTION 'Insurance snapshot requires an authoritative pricing snapshot';
  END IF;
  IF NEW.currency <> pricing_currency THEN
    RAISE EXCEPTION 'Insurance snapshot currency must match pricing snapshot currency';
  END IF;

  SELECT config."requirementMode", config."availabilityScope", config."showCustomerSelection",
         config."preselectedByDefault", config."showInConfirmation"
  INTO configured_mode, configured_scope, configured_selection, configured_preselection, configured_confirmation
  FROM "InsuranceConfigVersion" config
  WHERE config."configurationVersionId" = NEW."insuranceConfigVersionId";

  IF configured_mode IS NULL OR
     NEW."requirementMode" <> configured_mode OR
     NEW."availabilityScope" <> configured_scope OR
     NEW."customerSelectionShown" <> configured_selection OR
     NEW.preselected <> configured_preselection OR
     NEW."showInConfirmation" <> configured_confirmation THEN
    RAISE EXCEPTION 'Insurance snapshot must preserve exact configuration behavior';
  END IF;

  IF NEW."availabilityScope" = 'SELECTED_VEHICLES' THEN
    IF NEW."availabilityVehicleId" <> booked_car_id OR NOT EXISTS (
      SELECT 1 FROM "InsuranceVehicleAvailability" availability
      WHERE availability."insuranceConfigVersionId" = NEW."insuranceConfigVersionId"
        AND availability."carId" = booked_car_id
        AND availability.available = true
    ) THEN
      RAISE EXCEPTION 'Insurance snapshot lacks exact booked-vehicle availability evidence';
    END IF;
  END IF;

  IF NOT pricing_compatibility THEN
    IF pricing_release_id IS NULL THEN
      RAISE EXCEPTION 'Release-backed insurance snapshot requires release provenance';
    END IF;
    SELECT release."insuranceConfigVersionId", general_config.currency
    INTO release_insurance_id, release_currency
    FROM "BusinessConfigurationRelease" release
    JOIN "GeneralRentalConfigVersion" general_config
      ON general_config."configurationVersionId" = release."generalRentalConfigVersionId"
    WHERE release.id = pricing_release_id;
    IF release_insurance_id <> NEW."insuranceConfigVersionId" OR release_currency <> NEW.currency THEN
      RAISE EXCEPTION 'Insurance snapshot does not match its configuration release';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "BookingInsuranceSnapshot_consistency"
AFTER INSERT ON "BookingInsuranceSnapshot"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_booking_insurance_snapshot_consistency();

CREATE OR REPLACE FUNCTION enforce_customer_driver_snapshot_provenance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pricing_release_id text;
  pricing_compatibility boolean;
  release_customer_driver_id text;
BEGIN
  SELECT pricing."configurationReleaseId", pricing."compatibilityMode"
  INTO pricing_release_id, pricing_compatibility
  FROM "BookingPricingSnapshot" pricing
  WHERE pricing."bookingId" = NEW."bookingId";

  IF pricing_compatibility = false THEN
    IF NEW."customerDriverConfigVersionId" IS NULL OR NEW."validatedAt" IS NULL THEN
      RAISE EXCEPTION 'Release-backed customer/driver snapshot requires provenance and validation time';
    END IF;
    SELECT release."customerDriverConfigVersionId"
    INTO release_customer_driver_id
    FROM "BusinessConfigurationRelease" release
    WHERE release.id = pricing_release_id;
    IF release_customer_driver_id IS NULL OR release_customer_driver_id <> NEW."customerDriverConfigVersionId" THEN
      RAISE EXCEPTION 'Customer/driver snapshot does not match its configuration release';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "BookingCustomerDriverSnapshot_provenance"
AFTER INSERT ON "BookingCustomerDriverSnapshot"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_customer_driver_snapshot_provenance();
