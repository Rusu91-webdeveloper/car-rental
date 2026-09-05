-- Additive payment lifecycle and durable booking-email delivery state.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'DEPOSIT_PAID';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'NOTIFICATION_RETRIED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'BOOKING_CREATED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'BOOKING_STATUS_CHANGED';

CREATE TYPE "PaymentPurpose" AS ENUM ('DEPOSIT', 'BALANCE', 'FULL');
CREATE TYPE "BookingNotificationEvent" AS ENUM (
  'CUSTOMER_TRANSFER_INSTRUCTIONS',
  'CUSTOMER_CASH_CONFIRMATION',
  'CUSTOMER_TRANSFER_CONFIRMED',
  'CUSTOMER_TRANSFER_EXPIRED',
  'ADMIN_BOOKING_CREATED'
);
CREATE TYPE "BookingNotificationRecipient" AS ENUM ('CUSTOMER', 'ADMIN');
CREATE TYPE "BookingNotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

ALTER TABLE "Booking" ADD COLUMN "paymentDueAt" TIMESTAMP(3);

ALTER TABLE "Payment"
  ADD COLUMN "purpose" "PaymentPurpose",
  ADD COLUMN "method" "BookingPaymentMethod",
  ADD COLUMN "receivedAt" TIMESTAMP(3),
  ADD COLUMN "recordedById" TEXT;

CREATE TABLE "BookingNotification" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "event" "BookingNotificationEvent" NOT NULL,
  "recipient" "BookingNotificationRecipient" NOT NULL,
  "eventKey" VARCHAR(160) NOT NULL,
  "status" "BookingNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "providerMessageId" VARCHAR(255),
  "lastErrorCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingNotification_eventKey_key" ON "BookingNotification"("eventKey");
CREATE INDEX "BookingNotification_status_nextAttemptAt_idx" ON "BookingNotification"("status", "nextAttemptAt");
CREATE INDEX "BookingNotification_bookingId_createdAt_idx" ON "BookingNotification"("bookingId", "createdAt");
CREATE INDEX "Payment_recordedById_receivedAt_idx" ON "Payment"("recordedById", "receivedAt");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BookingNotification"
  ADD CONSTRAINT "BookingNotification_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Historical bookings are deliberately not reclassified. Their null deadline
-- means no new automatic cancellation is applied without an owner decision.
