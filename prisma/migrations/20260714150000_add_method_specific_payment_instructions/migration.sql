-- Payment instructions belong to a configured offline payment method. Existing
-- rows inherit the version's default method so the migration is non-destructive.
ALTER TABLE "PaymentInstructionTranslation"
ADD COLUMN "method" "ConfiguredPaymentMode";

UPDATE "PaymentInstructionTranslation" instruction
SET "method" = config."defaultMethod"
FROM "PaymentConfigVersion" config
WHERE config."configurationVersionId" = instruction."paymentConfigVersionId";

ALTER TABLE "PaymentInstructionTranslation"
ALTER COLUMN "method" SET NOT NULL;

DROP INDEX "PaymentInstructionTranslation_paymentConfigVersionId_locale_key";
DROP INDEX "PaymentInstructionTranslation_locale_idx";

CREATE UNIQUE INDEX "PaymentInstructionTranslation_paymentConfigVersionId_method_key"
ON "PaymentInstructionTranslation"("paymentConfigVersionId", "method", "locale");

CREATE INDEX "PaymentInstructionTranslation_method_locale_idx"
ON "PaymentInstructionTranslation"("method", "locale");
