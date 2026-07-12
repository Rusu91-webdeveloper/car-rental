-- Phase 3 compatibility snapshots have no active release provenance by design.
-- Release-backed snapshots continue to populate all four immutable foreign keys.
ALTER TABLE "BookingPricingSnapshot"
  ALTER COLUMN "configurationReleaseId" DROP NOT NULL,
  ALTER COLUMN "pricingConfigVersionId" DROP NOT NULL,
  ALTER COLUMN "fleetRateSetId" DROP NOT NULL,
  ALTER COLUMN "vehicleRentalRateId" DROP NOT NULL,
  ALTER COLUMN "releaseNumber" DROP NOT NULL,
  ALTER COLUMN "pricingVersionNumber" DROP NOT NULL,
  ALTER COLUMN "fleetRateSetVersionNumber" DROP NOT NULL,
  ADD COLUMN "compatibilityMode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rateSourceType" TEXT,
  ADD COLUMN "rateSourceReference" TEXT,
  ADD COLUMN "mixedDurationStrategy" "MixedDurationPricingStrategy" NOT NULL DEFAULT 'DAILY_ONLY';

-- A defensive forward backfill keeps any already-created release-backed snapshot valid.
UPDATE "BookingPricingSnapshot"
SET
  "rateSourceType" = 'FLEET_RATE_SET',
  "rateSourceReference" = "vehicleRentalRateId"
WHERE "rateSourceType" IS NULL;

ALTER TABLE "BookingPricingSnapshot"
  ALTER COLUMN "rateSourceType" SET NOT NULL,
  ALTER COLUMN "rateSourceReference" SET NOT NULL;

ALTER TABLE "BookingPricingSnapshot"
  ADD CONSTRAINT "BookingPricingSnapshot_provenance_consistency_check"
  CHECK (
    (
      "compatibilityMode" = true
      AND "configurationReleaseId" IS NULL
      AND "pricingConfigVersionId" IS NULL
      AND "fleetRateSetId" IS NULL
      AND "vehicleRentalRateId" IS NULL
      AND "releaseNumber" IS NULL
      AND "pricingVersionNumber" IS NULL
      AND "fleetRateSetVersionNumber" IS NULL
      AND "rateSourceType" = 'CAR_PRICE'
    )
    OR
    (
      "compatibilityMode" = false
      AND "configurationReleaseId" IS NOT NULL
      AND "pricingConfigVersionId" IS NOT NULL
      AND "fleetRateSetId" IS NOT NULL
      AND "vehicleRentalRateId" IS NOT NULL
      AND "releaseNumber" IS NOT NULL
      AND "pricingVersionNumber" IS NOT NULL
      AND "fleetRateSetVersionNumber" IS NOT NULL
      AND "rateSourceType" = 'FLEET_RATE_SET'
    )
  );

CREATE INDEX "BookingPricingSnapshot_compatibilityMode_calculatedAt_idx"
  ON "BookingPricingSnapshot"("compatibilityMode", "calculatedAt");
