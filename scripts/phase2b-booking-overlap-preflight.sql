-- Read-only preflight for the separately gated booking-overlap constraint.
-- Any returned row must be investigated before considering the exclusion constraint.

SELECT
  first_booking.id AS "firstBookingId",
  second_booking.id AS "secondBookingId",
  first_booking."carId",
  first_booking."pickupDate" AS "firstPickupDate",
  first_booking."dropoffDate" AS "firstDropoffDate",
  second_booking."pickupDate" AS "secondPickupDate",
  second_booking."dropoffDate" AS "secondDropoffDate"
FROM "Booking" first_booking
JOIN "Booking" second_booking
  ON first_booking."carId" = second_booking."carId"
 AND first_booking.id < second_booking.id
 AND first_booking."pickupDate" < second_booking."dropoffDate"
 AND first_booking."dropoffDate" > second_booking."pickupDate"
WHERE first_booking.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
  AND second_booking.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
ORDER BY first_booking."carId", first_booking."pickupDate";

-- NOT APPLIED. Requires a separate approval gate, clean preflight, PostgreSQL btree_gist
-- extension permission, and a maintenance window because exclusion constraints cannot
-- be added NOT VALID.
--
-- CREATE EXTENSION IF NOT EXISTS btree_gist;
-- ALTER TABLE "Booking"
-- ADD CONSTRAINT "Booking_no_active_vehicle_overlap"
-- EXCLUDE USING gist (
--   "carId" WITH =,
--   tsrange("pickupDate", "dropoffDate", '[)') WITH &&
-- )
-- WHERE (status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS'));
