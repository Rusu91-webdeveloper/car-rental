-- Synthetic legacy data for the disposable Phase 2B verification database only.
-- Contains no production-like personal data.

INSERT INTO "User" (id, email, name, role, "isActive", "createdAt", "updatedAt") VALUES
  ('phase2b-admin', 'admin@example.invalid', 'Disposable Admin', 'ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('phase2b-user', 'customer@example.invalid', 'Disposable Customer', 'USER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "CompanySettings" (id, currency, "updatedAt")
VALUES ('company-settings', 'EUR', CURRENT_TIMESTAMP);

INSERT INTO "Car" (
  id, slug, name, description, category, price, image, status, gearbox, seats,
  "fuelType", acceleration, "createdAt", "updatedAt"
) VALUES (
  'phase2b-car', 'phase2b-test-car', 'Disposable Test Car', 'Synthetic car for schema verification only.',
  'SEDAN', 12345, 'https://example.invalid/car.jpg', 'AVAILABLE', 'Automatic', 5,
  'Electric', '5.0sec', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "Booking" (
  id, "bookingNumber", "transferCode", locale, "userId", "carId", "pickupDate", "dropoffDate",
  location, "pricePerDay", "totalDays", "totalPrice", "depositAmount", "guaranteeAmount",
  status, "paymentStatus", "paymentMethod", "createdAt", "updatedAt"
) VALUES (
  'phase2b-booking', 'PHASE2B-BOOKING', 'P2BTEST1', 'de', 'phase2b-user', 'phase2b-car',
  CURRENT_TIMESTAMP + INTERVAL '10 days', CURRENT_TIMESTAMP + INTERVAL '11 days',
  'Disposable test location', 12345, 1, 12345, 0, 0,
  'PENDING', 'PENDING', 'TRANSFER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
