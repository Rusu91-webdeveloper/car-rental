-- Additive production payment policy snapshots, receipt/refund ledger, and notification events.
CREATE TYPE "PaymentKind" AS ENUM ('RECEIPT', 'REFUND');
CREATE TYPE "RefundReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'RESOLVED');

ALTER TYPE "BookingNotificationEvent" ADD VALUE IF NOT EXISTS 'CUSTOMER_ADVANCE_INSTRUCTIONS';
ALTER TYPE "BookingNotificationEvent" ADD VALUE IF NOT EXISTS 'CUSTOMER_BOOKING_CONFIRMED';
ALTER TYPE "BookingNotificationEvent" ADD VALUE IF NOT EXISTS 'CUSTOMER_BALANCE_RECEIPT';
ALTER TYPE "BookingNotificationEvent" ADD VALUE IF NOT EXISTS 'CUSTOMER_BOOKING_CANCELLED';
ALTER TYPE "BookingNotificationEvent" ADD VALUE IF NOT EXISTS 'CUSTOMER_REFUND_CONFIRMED';
ALTER TYPE "BookingNotificationEvent" ADD VALUE IF NOT EXISTS 'CUSTOMER_PAYMENT_EXPIRED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'PAYMENT_REFUNDED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'REFUND_REVIEW_RESOLVED';

ALTER TABLE "Booking"
  ADD COLUMN "advancePaymentAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundReviewStatus" "RefundReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED';

ALTER TABLE "Payment"
  ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'RECEIPT',
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "relatedPaymentId" TEXT;

ALTER TABLE "BookingNotification" ADD COLUMN "payloadSnapshot" JSONB;

ALTER TABLE "BookingApplicationPaymentSelection"
  ADD COLUMN "remainingBalanceRule" "RemainingBalanceRule" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "instructionLocale" VARCHAR(10),
  ADD COLUMN "instructionText" TEXT;

CREATE TABLE "BookingPaymentPolicySnapshot" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "paymentConfigVersionId" TEXT,
  "configuredPaymentMode" "ConfiguredPaymentMode" NOT NULL,
  "bookingPaymentMethod" "BookingPaymentMethod" NOT NULL,
  "depositType" "DepositType" NOT NULL,
  "depositValue" INTEGER NOT NULL,
  "depositRateBps" INTEGER,
  "depositAmount" INTEGER NOT NULL,
  "advancePaymentAmount" INTEGER NOT NULL,
  "remainingBalanceRule" "RemainingBalanceRule" NOT NULL,
  "instructionLocale" VARCHAR(10) NOT NULL,
  "instructionText" TEXT,
  "accountName" TEXT,
  "iban" TEXT,
  "bic" TEXT,
  "bankName" TEXT,
  "companyName" TEXT,
  "companyEmail" TEXT,
  "companyPhone" TEXT,
  "companyAddress" TEXT,
  "companyPostalCode" TEXT,
  "companyCity" TEXT,
  "companyCountry" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingPaymentPolicySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingPaymentPolicySnapshot_bookingId_key"
  ON "BookingPaymentPolicySnapshot"("bookingId");
CREATE INDEX "BookingPaymentPolicySnapshot_paymentConfigVersionId_idx"
  ON "BookingPaymentPolicySnapshot"("paymentConfigVersionId");
CREATE INDEX "BookingPaymentPolicySnapshot_configuredPaymentMode_idx"
  ON "BookingPaymentPolicySnapshot"("configuredPaymentMode");
CREATE INDEX "Booking_status_paymentStatus_paymentDueAt_idx"
  ON "Booking"("status", "paymentStatus", "paymentDueAt");
CREATE INDEX "Booking_refundReviewStatus_idx" ON "Booking"("refundReviewStatus");
CREATE INDEX "Payment_bookingId_kind_status_idx" ON "Payment"("bookingId", "kind", "status");
CREATE INDEX "Payment_relatedPaymentId_idx" ON "Payment"("relatedPaymentId");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_relatedPaymentId_fkey"
  FOREIGN KEY ("relatedPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BookingPaymentPolicySnapshot"
  ADD CONSTRAINT "BookingPaymentPolicySnapshot_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve historical status/deadline behavior while giving legacy transfers
-- a correct advance amount for admin display and future receipt recording.
UPDATE "Booking"
SET "advancePaymentAmount" = CASE
  WHEN "paymentMethod" = 'TRANSFER' AND "depositAmount" > 0
    THEN LEAST("depositAmount", "totalPrice")
  WHEN "paymentMethod" = 'TRANSFER'
    THEN "totalPrice"
  WHEN "paymentMethod" = 'PAY_AT_PICKUP' AND "depositAmount" > 0
    THEN LEAST("depositAmount", "totalPrice")
  ELSE 0
END;
