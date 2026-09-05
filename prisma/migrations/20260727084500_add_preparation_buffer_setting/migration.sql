ALTER TABLE "PricingBillingConfigVersion"
ADD COLUMN "preparationBufferMinutes" INTEGER NOT NULL DEFAULT 120;

ALTER TABLE "PricingBillingConfigVersion"
ADD CONSTRAINT "PricingBillingConfigVersion_preparation_buffer_range"
CHECK ("preparationBufferMinutes" >= 0 AND "preparationBufferMinutes" <= 720);
