\set ON_ERROR_STOP on

-- Disposable PostgreSQL only. Requires the synthetic Phase 6 integration fixture.
INSERT INTO "Booking" (
  id, "bookingNumber", "transferCode", locale, "userId", "carId", "pickupDate", "dropoffDate", location,
  "pricePerDay", "totalDays", "totalPrice", "depositAmount", status, "paymentStatus", "paymentMethod", "createdAt", "updatedAt"
) VALUES (
  'p6-constraint-booking', 'P6-CONSTRAINT', 'P6CHK', 'en', 'p4-manager', 'p4-car',
  '2032-01-01T10:00:00Z', '2032-01-02T10:00:00Z', 'Synthetic',
  10000, 1, 10000, 0, 'PENDING', 'PENDING', 'PAY_AT_PICKUP', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT (id) DO NOTHING;

INSERT INTO "BookingPricingSnapshot" (
  id, "bookingId", "configurationReleaseId", "pricingConfigVersionId", "fleetRateSetId", "vehicleRentalRateId",
  "releaseNumber", "pricingVersionNumber", "fleetRateSetVersionNumber", "pricingEngineVersion", currency,
  "chargeableDurationMinutes", "chargeableDays", "billableDayMethod", "rentalMonthDefinition", "dailyUnits",
  "sourceDailyRate", "baseSubtotal", "grandTotal", "calculatedAt", "compatibilityMode", "rateSourceType",
  "rateSourceReference", "mixedDurationStrategy"
)
SELECT 'p6-constraint-pricing', 'p6-constraint-booking', release.id, release."pricingBillingConfigVersionId",
       release."fleetRateSetId", rate.id, release."releaseNumber", pricing_version."versionNumber",
       fleet."versionNumber", 'pricing-engine-v1', general.currency, 1440, 1, 'STARTED_24_HOUR_PERIODS',
       'FIXED_30_DAYS', 1, rate."dailyRate", rate."dailyRate", rate."dailyRate", CURRENT_TIMESTAMP, false,
       'FLEET_RATE_SET', rate.id, 'DAILY_ONLY'
FROM "BusinessConfigurationRelease" release
JOIN "GeneralRentalConfigVersion" general ON general."configurationVersionId" = release."generalRentalConfigVersionId"
JOIN "ConfigurationVersion" pricing_version ON pricing_version.id = release."pricingBillingConfigVersionId"
JOIN "FleetRateSet" fleet ON fleet.id = release."fleetRateSetId"
JOIN "VehicleRentalRate" rate ON rate."fleetRateSetId" = fleet.id AND rate."carId" = 'p4-car'
WHERE release.status = 'ACTIVE'
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE message text;
BEGIN
  BEGIN
    INSERT INTO "BookingCustomerDriverSnapshot" (
      id, "bookingId", "firstName", "lastName", email, "capturedAt"
    ) VALUES ('p6-invalid-provenance', 'p6-constraint-booking', 'Synthetic', 'Missing', 'missing@example.invalid', CURRENT_TIMESTAMP);
    SET CONSTRAINTS "BookingCustomerDriverSnapshot_provenance" IMMEDIATE;
    RAISE EXCEPTION 'expected provenance rejection was not raised';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
    IF message NOT LIKE '%requires provenance and validation time%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO "BookingInsuranceSnapshot" (
      id, "bookingId", "insuranceConfigVersionId", selected, "requirementMode", "customerFacingName",
      "unitPrice", "billableDays", subtotal, currency, "taxTreatment", "availabilityScope",
      "customerSelectionShown", preselected, "showInConfirmation", "capturedAt"
    )
    SELECT 'p6-invalid-currency', 'p6-constraint-booking', release."insuranceConfigVersionId", true, 'OPTIONAL',
           'Vollkasko', 1000, 1, 1000, 'USD', 'INHERIT_RENTAL', 'ALL_VEHICLES', true, false, true, CURRENT_TIMESTAMP
    FROM "BusinessConfigurationRelease" release WHERE release.status = 'ACTIVE';
    SET CONSTRAINTS "BookingInsuranceSnapshot_consistency" IMMEDIATE;
    RAISE EXCEPTION 'expected currency rejection was not raised';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
    IF message NOT LIKE '%currency must match%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO "BookingInsuranceSnapshot" (
      id, "bookingId", "insuranceConfigVersionId", "availabilityVehicleId", selected, "requirementMode",
      "customerFacingName", "unitPrice", "billableDays", subtotal, currency, "taxTreatment", "availabilityScope",
      "customerSelectionShown", preselected, "showInConfirmation", "capturedAt"
    ) VALUES (
      'p6-invalid-availability', 'p6-constraint-booking', 'p4-insurance', 'p4-car', false, 'DISABLED',
      'Insurance', 0, 1, 0, 'EUR', 'INHERIT_RENTAL', 'ALL_VEHICLES', false, false, true, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'expected availability rejection was not raised';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "BookingInsuranceSnapshot" (
      id, "bookingId", "insuranceConfigVersionId", selected, "requirementMode", "customerFacingName",
      "unitPrice", "billableDays", subtotal, currency, "taxTreatment", "availabilityScope",
      "customerSelectionShown", preselected, "showInConfirmation", "capturedAt"
    ) VALUES (
      'p6-invalid-selection', 'p6-constraint-booking', 'p4-insurance', true, 'DISABLED',
      'Insurance', 0, 1, 0, 'EUR', 'INHERIT_RENTAL', 'ALL_VEHICLES', false, false, true, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'expected selection rejection was not raised';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
