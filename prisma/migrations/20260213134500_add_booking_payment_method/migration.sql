CREATE TYPE "BookingPaymentMethod" AS ENUM ('TRANSFER', 'PAY_AT_PICKUP');

ALTER TABLE "Booking"
ADD COLUMN "paymentMethod" "BookingPaymentMethod" NOT NULL DEFAULT 'TRANSFER';

CREATE INDEX "Booking_paymentMethod_idx" ON "Booking"("paymentMethod");
