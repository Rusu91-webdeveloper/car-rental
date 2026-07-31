ALTER TABLE "Booking"
ADD COLUMN "businessTimeZone" TEXT NOT NULL DEFAULT 'UTC';

UPDATE "Booking" AS booking
SET "businessTimeZone" = application."businessTimeZone"
FROM "BookingApplication" AS application
WHERE application."bookingId" = booking.id;

UPDATE "Booking" AS booking
SET "businessTimeZone" = general_rental."businessTimeZone"
FROM "BookingPricingSnapshot" AS snapshot
JOIN "BusinessConfigurationRelease" AS release
  ON release.id = snapshot."configurationReleaseId"
JOIN "GeneralRentalConfigVersion" AS general_rental
  ON general_rental."configurationVersionId" = release."generalRentalConfigVersionId"
WHERE snapshot."bookingId" = booking.id
  AND NOT EXISTS (
    SELECT 1
    FROM "BookingApplication" AS application
    WHERE application."bookingId" = booking.id
  );
