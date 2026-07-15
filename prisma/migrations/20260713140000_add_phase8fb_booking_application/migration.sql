-- CreateEnum
CREATE TYPE "BookingApplicationStatus" AS ENUM ('DRAFT', 'AWAITING_DOCUMENT_UPLOAD', 'AWAITING_DOCUMENT_REVIEW', 'CUSTOMER_ACTION_REQUIRED', 'READY_TO_FINALIZE', 'FINALIZING', 'FINALIZED', 'EXPIRED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BookingApplicationActionReason" AS ENUM ('PRICE_CHANGED', 'VEHICLE_UNAVAILABLE', 'CONFIGURATION_CHANGED', 'LEGAL_VERSION_CHANGED', 'RENTAL_DATES_CHANGED', 'INSURANCE_CHANGED', 'PAYMENT_RULES_CHANGED', 'CUSTOMER_DATA_INVALID', 'DOCUMENT_REPLACEMENT_REQUIRED');

-- AlterTable
ALTER TABLE "DocumentUploadSession" ADD COLUMN     "bookingApplicationId" TEXT;

-- CreateTable
CREATE TABLE "BookingApplication" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "pickupAt" TIMESTAMP(3) NOT NULL,
    "returnAt" TIMESTAMP(3) NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "returnLocation" TEXT NOT NULL,
    "businessTimeZone" TEXT NOT NULL,
    "status" "BookingApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "configurationReleaseId" TEXT NOT NULL,
    "generalRentalConfigVersionId" TEXT NOT NULL,
    "pricingBillingConfigVersionId" TEXT NOT NULL,
    "fleetRateSetId" TEXT NOT NULL,
    "insuranceConfigVersionId" TEXT NOT NULL,
    "customerDriverConfigVersionId" TEXT NOT NULL,
    "bookingWorkflowConfigVersionId" TEXT NOT NULL,
    "documentPolicyConfigVersionId" TEXT NOT NULL,
    "paymentConfigVersionId" TEXT NOT NULL,
    "confirmationConfigVersionId" TEXT NOT NULL,
    "legalAcceptanceConfigVersionId" TEXT NOT NULL,
    "paymentMethod" "BookingPaymentMethod" NOT NULL,
    "legalAcceptanceRound" INTEGER NOT NULL DEFAULT 1,
    "actionRequiredReason" "BookingApplicationActionReason",
    "actionRequiredAt" TIMESTAMP(3),
    "terminalReason" VARCHAR(500),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingApplicationCustomerDriver" (
    "id" TEXT NOT NULL,
    "bookingApplicationId" TEXT NOT NULL,
    "customerDriverConfigVersionId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "dateOfBirth" DATE,
    "country" VARCHAR(2),
    "address" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "nationality" VARCHAR(2),
    "licenceNumber" TEXT,
    "licenceIssueDate" DATE,
    "licenceExpiryDate" DATE,
    "licenceIssuingCountry" VARCHAR(2),
    "licenceHeldSinceDate" DATE,
    "validationStatus" "ConfigurationValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
    "validatorVersion" TEXT,
    "validatedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingApplicationCustomerDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingApplicationInsuranceSelection" (
    "id" TEXT NOT NULL,
    "bookingApplicationId" TEXT NOT NULL,
    "insuranceConfigVersionId" TEXT NOT NULL,
    "availabilityVehicleId" TEXT,
    "selected" BOOLEAN NOT NULL,
    "requirementMode" "InsuranceRequirementMode" NOT NULL,
    "customerFacingName" TEXT NOT NULL,
    "description" TEXT,
    "unitPrice" INTEGER NOT NULL,
    "billableDays" INTEGER NOT NULL,
    "quotedSubtotal" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "taxTreatment" "InsuranceTaxTreatment" NOT NULL,
    "availabilityScope" "InsuranceAvailabilityScope" NOT NULL,
    "customerSelectionShown" BOOLEAN NOT NULL,
    "preselected" BOOLEAN NOT NULL,
    "showInConfirmation" BOOLEAN NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingApplicationInsuranceSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingApplicationPaymentSelection" (
    "id" TEXT NOT NULL,
    "bookingApplicationId" TEXT NOT NULL,
    "paymentConfigVersionId" TEXT NOT NULL,
    "paymentInstructionTranslationId" TEXT,
    "bookingPaymentMethod" "BookingPaymentMethod" NOT NULL,
    "configuredPaymentMode" "ConfiguredPaymentMode" NOT NULL,
    "depositType" "DepositType" NOT NULL,
    "depositValue" INTEGER NOT NULL,
    "quotedDepositAmount" INTEGER NOT NULL,
    "quotedDepositRateBps" INTEGER,
    "currency" VARCHAR(3) NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingApplicationPaymentSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingApplicationPricingQuote" (
    "id" TEXT NOT NULL,
    "bookingApplicationId" TEXT NOT NULL,
    "quoteVersion" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "supersedesPricingQuoteId" TEXT,
    "configurationReleaseId" TEXT NOT NULL,
    "pricingConfigVersionId" TEXT NOT NULL,
    "fleetRateSetId" TEXT NOT NULL,
    "vehicleRentalRateId" TEXT NOT NULL,
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "releaseNumber" INTEGER NOT NULL,
    "pricingVersionNumber" INTEGER NOT NULL,
    "fleetRateSetVersionNumber" INTEGER NOT NULL,
    "pricingEngineVersion" TEXT NOT NULL,
    "compatibilityMode" BOOLEAN NOT NULL DEFAULT false,
    "rateSourceType" TEXT NOT NULL,
    "rateSourceReference" TEXT NOT NULL,
    "mixedDurationStrategy" "MixedDurationPricingStrategy" NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "chargeableDurationMinutes" INTEGER NOT NULL,
    "chargeableDays" INTEGER NOT NULL,
    "billableDayMethod" "BillableDayMethod" NOT NULL,
    "rentalMonthDefinition" "RentalMonthDefinition" NOT NULL,
    "dailyUnits" INTEGER NOT NULL DEFAULT 0,
    "weeklyUnits" INTEGER NOT NULL DEFAULT 0,
    "monthlyUnits" INTEGER NOT NULL DEFAULT 0,
    "sourceDailyRate" INTEGER NOT NULL,
    "sourceWeeklyRate" INTEGER,
    "sourceMonthlyRate" INTEGER,
    "baseSubtotal" INTEGER NOT NULL,
    "insuranceSubtotal" INTEGER NOT NULL DEFAULT 0,
    "adjustmentTotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "grandTotal" INTEGER NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "calculationTrace" JSONB,
    "requiresCustomerConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingApplicationPricingQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingApplicationLegalAcceptance" (
    "id" TEXT NOT NULL,
    "bookingApplicationId" TEXT NOT NULL,
    "legalDocumentVersionId" TEXT NOT NULL,
    "legalDocumentTranslationId" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "configurationReleaseId" TEXT NOT NULL,
    "legalAcceptanceConfigVersionId" TEXT NOT NULL,
    "documentType" "LegalDocumentType" NOT NULL,
    "documentVersionNumber" INTEGER NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "LegalAcceptanceSource" NOT NULL,
    "contentSnapshot" TEXT,
    "acceptanceRound" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingApplicationLegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingApplication_idempotencyKey_key" ON "BookingApplication"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BookingApplication_bookingId_key" ON "BookingApplication"("bookingId");

-- CreateIndex
CREATE INDEX "BookingApplication_customerUserId_status_expiresAt_idx" ON "BookingApplication"("customerUserId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "BookingApplication_carId_pickupAt_returnAt_idx" ON "BookingApplication"("carId", "pickupAt", "returnAt");

-- CreateIndex
CREATE INDEX "BookingApplication_status_expiresAt_idx" ON "BookingApplication"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "BookingApplication_status_readyAt_idx" ON "BookingApplication"("status", "readyAt");

-- CreateIndex
CREATE INDEX "BookingApplication_status_lastActivityAt_idx" ON "BookingApplication"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "BookingApplication_configurationReleaseId_idx" ON "BookingApplication"("configurationReleaseId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingApplicationCustomerDriver_bookingApplicationId_key" ON "BookingApplicationCustomerDriver"("bookingApplicationId");

-- CreateIndex
CREATE INDEX "BookingApplicationCustomerDriver_customerDriverConfigVersio_idx" ON "BookingApplicationCustomerDriver"("customerDriverConfigVersionId");

-- CreateIndex
CREATE INDEX "BookingApplicationCustomerDriver_validationStatus_validated_idx" ON "BookingApplicationCustomerDriver"("validationStatus", "validatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingApplicationInsuranceSelection_bookingApplicationId_key" ON "BookingApplicationInsuranceSelection"("bookingApplicationId");

-- CreateIndex
CREATE INDEX "BookingApplicationInsuranceSelection_insuranceConfigVersion_idx" ON "BookingApplicationInsuranceSelection"("insuranceConfigVersionId");

-- CreateIndex
CREATE INDEX "BookingApplicationInsuranceSelection_availabilityVehicleId_idx" ON "BookingApplicationInsuranceSelection"("availabilityVehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingApplicationPaymentSelection_bookingApplicationId_key" ON "BookingApplicationPaymentSelection"("bookingApplicationId");

-- CreateIndex
CREATE INDEX "BookingApplicationPaymentSelection_paymentConfigVersionId_idx" ON "BookingApplicationPaymentSelection"("paymentConfigVersionId");

-- CreateIndex
CREATE INDEX "BookingApplicationPaymentSelection_paymentInstructionTransl_idx" ON "BookingApplicationPaymentSelection"("paymentInstructionTranslationId");

-- CreateIndex
CREATE INDEX "BookingApplicationPricingQuote_bookingApplicationId_isCurre_idx" ON "BookingApplicationPricingQuote"("bookingApplicationId", "isCurrent", "expiresAt");

-- CreateIndex
CREATE INDEX "BookingApplicationPricingQuote_configurationReleaseId_idx" ON "BookingApplicationPricingQuote"("configurationReleaseId");

-- CreateIndex
CREATE INDEX "BookingApplicationPricingQuote_pricingConfigVersionId_idx" ON "BookingApplicationPricingQuote"("pricingConfigVersionId");

-- CreateIndex
CREATE INDEX "BookingApplicationPricingQuote_fleetRateSetId_idx" ON "BookingApplicationPricingQuote"("fleetRateSetId");

-- CreateIndex
CREATE INDEX "BookingApplicationPricingQuote_vehicleRentalRateId_idx" ON "BookingApplicationPricingQuote"("vehicleRentalRateId");

-- CreateIndex
CREATE INDEX "BookingApplicationPricingQuote_confirmedByUserId_confirmedA_idx" ON "BookingApplicationPricingQuote"("confirmedByUserId", "confirmedAt");

-- CreateIndex
CREATE INDEX "BookingApplicationPricingQuote_supersedesPricingQuoteId_idx" ON "BookingApplicationPricingQuote"("supersedesPricingQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingApplicationPricingQuote_bookingApplicationId_quoteVe_key" ON "BookingApplicationPricingQuote"("bookingApplicationId", "quoteVersion");

-- CreateIndex
CREATE INDEX "BookingApplicationLegalAcceptance_legalDocumentVersionId_idx" ON "BookingApplicationLegalAcceptance"("legalDocumentVersionId");

-- CreateIndex
CREATE INDEX "BookingApplicationLegalAcceptance_legalDocumentTranslationI_idx" ON "BookingApplicationLegalAcceptance"("legalDocumentTranslationId");

-- CreateIndex
CREATE INDEX "BookingApplicationLegalAcceptance_customerUserId_acceptedAt_idx" ON "BookingApplicationLegalAcceptance"("customerUserId", "acceptedAt");

-- CreateIndex
CREATE INDEX "BookingApplicationLegalAcceptance_configurationReleaseId_idx" ON "BookingApplicationLegalAcceptance"("configurationReleaseId");

-- CreateIndex
CREATE INDEX "BookingApplicationLegalAcceptance_legalAcceptanceConfigVers_idx" ON "BookingApplicationLegalAcceptance"("legalAcceptanceConfigVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingApplicationLegalAcceptance_bookingApplicationId_docu_key" ON "BookingApplicationLegalAcceptance"("bookingApplicationId", "documentType", "acceptanceRound");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentUploadSession_bookingApplicationId_key" ON "DocumentUploadSession"("bookingApplicationId");

-- CreateIndex
CREATE INDEX "DocumentUploadSession_bookingApplicationId_status_expiresAt_idx" ON "DocumentUploadSession"("bookingApplicationId", "status", "expiresAt");

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_configurationReleaseId_fkey" FOREIGN KEY ("configurationReleaseId") REFERENCES "BusinessConfigurationRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_generalRentalConfigVersionId_fkey" FOREIGN KEY ("generalRentalConfigVersionId") REFERENCES "GeneralRentalConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_pricingBillingConfigVersionId_fkey" FOREIGN KEY ("pricingBillingConfigVersionId") REFERENCES "PricingBillingConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_fleetRateSetId_fkey" FOREIGN KEY ("fleetRateSetId") REFERENCES "FleetRateSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_insuranceConfigVersionId_fkey" FOREIGN KEY ("insuranceConfigVersionId") REFERENCES "InsuranceConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_customerDriverConfigVersionId_fkey" FOREIGN KEY ("customerDriverConfigVersionId") REFERENCES "CustomerDriverConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_bookingWorkflowConfigVersionId_fkey" FOREIGN KEY ("bookingWorkflowConfigVersionId") REFERENCES "BookingWorkflowConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_documentPolicyConfigVersionId_fkey" FOREIGN KEY ("documentPolicyConfigVersionId") REFERENCES "DocumentPolicyConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_paymentConfigVersionId_fkey" FOREIGN KEY ("paymentConfigVersionId") REFERENCES "PaymentConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_confirmationConfigVersionId_fkey" FOREIGN KEY ("confirmationConfigVersionId") REFERENCES "ConfirmationConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplication" ADD CONSTRAINT "BookingApplication_legalAcceptanceConfigVersionId_fkey" FOREIGN KEY ("legalAcceptanceConfigVersionId") REFERENCES "LegalAcceptanceConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationCustomerDriver" ADD CONSTRAINT "BookingApplicationCustomerDriver_bookingApplicationId_fkey" FOREIGN KEY ("bookingApplicationId") REFERENCES "BookingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationCustomerDriver" ADD CONSTRAINT "BookingApplicationCustomerDriver_customerDriverConfigVersi_fkey" FOREIGN KEY ("customerDriverConfigVersionId") REFERENCES "CustomerDriverConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationInsuranceSelection" ADD CONSTRAINT "BookingApplicationInsuranceSelection_bookingApplicationId_fkey" FOREIGN KEY ("bookingApplicationId") REFERENCES "BookingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationInsuranceSelection" ADD CONSTRAINT "BookingApplicationInsuranceSelection_insuranceConfigVersio_fkey" FOREIGN KEY ("insuranceConfigVersionId") REFERENCES "InsuranceConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationInsuranceSelection" ADD CONSTRAINT "BookingApplicationInsuranceSelection_availabilityVehicleId_fkey" FOREIGN KEY ("availabilityVehicleId") REFERENCES "Car"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationPaymentSelection" ADD CONSTRAINT "BookingApplicationPaymentSelection_bookingApplicationId_fkey" FOREIGN KEY ("bookingApplicationId") REFERENCES "BookingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationPaymentSelection" ADD CONSTRAINT "BookingApplicationPaymentSelection_paymentConfigVersionId_fkey" FOREIGN KEY ("paymentConfigVersionId") REFERENCES "PaymentConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationPaymentSelection" ADD CONSTRAINT "BookingApplicationPaymentSelection_paymentInstructionTrans_fkey" FOREIGN KEY ("paymentInstructionTranslationId") REFERENCES "PaymentInstructionTranslation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationPricingQuote" ADD CONSTRAINT "BookingApplicationPricingQuote_bookingApplicationId_fkey" FOREIGN KEY ("bookingApplicationId") REFERENCES "BookingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationPricingQuote" ADD CONSTRAINT "BookingApplicationPricingQuote_configurationReleaseId_fkey" FOREIGN KEY ("configurationReleaseId") REFERENCES "BusinessConfigurationRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationPricingQuote" ADD CONSTRAINT "BookingApplicationPricingQuote_pricingConfigVersionId_fkey" FOREIGN KEY ("pricingConfigVersionId") REFERENCES "PricingBillingConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationPricingQuote" ADD CONSTRAINT "BookingApplicationPricingQuote_fleetRateSetId_fkey" FOREIGN KEY ("fleetRateSetId") REFERENCES "FleetRateSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationPricingQuote" ADD CONSTRAINT "BookingApplicationPricingQuote_vehicleRentalRateId_fkey" FOREIGN KEY ("vehicleRentalRateId") REFERENCES "VehicleRentalRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationPricingQuote" ADD CONSTRAINT "BookingApplicationPricingQuote_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationPricingQuote" ADD CONSTRAINT "BookingApplicationPricingQuote_supersedesPricingQuoteId_fkey" FOREIGN KEY ("supersedesPricingQuoteId") REFERENCES "BookingApplicationPricingQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationLegalAcceptance" ADD CONSTRAINT "BookingApplicationLegalAcceptance_bookingApplicationId_fkey" FOREIGN KEY ("bookingApplicationId") REFERENCES "BookingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationLegalAcceptance" ADD CONSTRAINT "BookingApplicationLegalAcceptance_legalDocumentVersionId_fkey" FOREIGN KEY ("legalDocumentVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationLegalAcceptance" ADD CONSTRAINT "BookingApplicationLegalAcceptance_legalDocumentTranslation_fkey" FOREIGN KEY ("legalDocumentTranslationId") REFERENCES "LegalDocumentTranslation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationLegalAcceptance" ADD CONSTRAINT "BookingApplicationLegalAcceptance_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationLegalAcceptance" ADD CONSTRAINT "BookingApplicationLegalAcceptance_configurationReleaseId_fkey" FOREIGN KEY ("configurationReleaseId") REFERENCES "BusinessConfigurationRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingApplicationLegalAcceptance" ADD CONSTRAINT "BookingApplicationLegalAcceptance_legalAcceptanceConfigVer_fkey" FOREIGN KEY ("legalAcceptanceConfigVersionId") REFERENCES "LegalAcceptanceConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUploadSession" ADD CONSTRAINT "DocumentUploadSession_bookingApplicationId_fkey" FOREIGN KEY ("bookingApplicationId") REFERENCES "BookingApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 8F-B integrity: applications are the mutable, expiring pre-booking aggregate.
ALTER TABLE "BookingApplication"
  ADD CONSTRAINT "BookingApplication_shape_check" CHECK (
    "revision" > 0 AND "legalAcceptanceRound" > 0 AND
    "pickupAt" < "returnAt" AND "expiresAt" > "createdAt" AND
    length(btrim("pickupLocation")) > 0 AND length(btrim("returnLocation")) > 0 AND
    length(btrim("businessTimeZone")) > 0 AND
    ("terminalReason" IS NULL OR length(btrim("terminalReason")) > 0) AND
    ("status" <> 'CUSTOMER_ACTION_REQUIRED' OR
      ("actionRequiredReason" IS NOT NULL AND "actionRequiredAt" IS NOT NULL)) AND
    ("status" NOT IN ('READY_TO_FINALIZE', 'FINALIZING', 'FINALIZED') OR "readyAt" IS NOT NULL) AND
    ("status" <> 'FINALIZED' OR ("bookingId" IS NOT NULL AND "finalizedAt" IS NOT NULL)) AND
    ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL) AND
    ("status" NOT IN ('EXPIRED', 'CANCELLED', 'REJECTED') OR "terminalReason" IS NOT NULL)
  );

ALTER TABLE "BookingApplicationCustomerDriver"
  ADD CONSTRAINT "BookingApplicationCustomerDriver_shape_check" CHECK (
    "revision" > 0 AND
    ("validationStatus" NOT IN ('VALID', 'WARNING') OR
      ("validatedAt" IS NOT NULL AND "validatorVersion" IS NOT NULL))
  );

ALTER TABLE "BookingApplicationInsuranceSelection"
  ADD CONSTRAINT "BookingApplicationInsuranceSelection_shape_check" CHECK (
    "revision" > 0 AND "unitPrice" >= 0 AND "billableDays" > 0 AND
    "quotedSubtotal" >= 0 AND
    ("selected" OR "quotedSubtotal" = 0)
  );

ALTER TABLE "BookingApplicationPaymentSelection"
  ADD CONSTRAINT "BookingApplicationPaymentSelection_shape_check" CHECK (
    "revision" > 0 AND "depositValue" >= 0 AND "quotedDepositAmount" >= 0 AND
    ("quotedDepositRateBps" IS NULL OR "quotedDepositRateBps" BETWEEN 0 AND 10000) AND
    (("depositType" = 'NONE' AND "depositValue" = 0 AND "quotedDepositAmount" = 0) OR
     ("depositType" = 'FIXED_AMOUNT' AND "quotedDepositRateBps" IS NULL) OR
     ("depositType" = 'PERCENTAGE_BPS' AND "depositValue" BETWEEN 0 AND 10000 AND
       "quotedDepositRateBps" = "depositValue"))
  );

ALTER TABLE "BookingApplicationPricingQuote"
  ADD CONSTRAINT "BookingApplicationPricingQuote_shape_check" CHECK (
    "quoteVersion" > 0 AND "snapshotSchemaVersion" > 0 AND
    "releaseNumber" > 0 AND "pricingVersionNumber" > 0 AND "fleetRateSetVersionNumber" > 0 AND
    "compatibilityMode" = false AND "chargeableDurationMinutes" > 0 AND "chargeableDays" > 0 AND
    "dailyUnits" >= 0 AND "weeklyUnits" >= 0 AND "monthlyUnits" >= 0 AND
    "sourceDailyRate" >= 0 AND "baseSubtotal" >= 0 AND "insuranceSubtotal" >= 0 AND
    "taxTotal" >= 0 AND "grandTotal" >= 0 AND
    "grandTotal" = "baseSubtotal" + "insuranceSubtotal" + "adjustmentTotal" + "taxTotal" AND
    "expiresAt" > "calculatedAt" AND
    (("confirmedAt" IS NULL AND "confirmedByUserId" IS NULL) OR
      ("confirmedAt" IS NOT NULL AND "confirmedByUserId" IS NOT NULL)) AND
    (NOT "requiresCustomerConfirmation" OR "confirmedAt" IS NULL OR "confirmedAt" <= "expiresAt") AND
    (("quoteVersion" = 1 AND "supersedesPricingQuoteId" IS NULL) OR
      ("quoteVersion" > 1 AND "supersedesPricingQuoteId" IS NOT NULL))
  );

ALTER TABLE "BookingApplicationLegalAcceptance"
  ADD CONSTRAINT "BookingApplicationLegalAcceptance_shape_check" CHECK (
    "documentVersionNumber" > 0 AND "acceptanceRound" > 0 AND
    "contentHash" ~ '^[0-9a-f]{64}$' AND "accepted" = true AND
    "source" IN ('CUSTOMER_CHECKBOX', 'CUSTOMER_SUBMISSION')
  );

CREATE UNIQUE INDEX "BookingApplicationPricingQuote_one_current_key"
  ON "BookingApplicationPricingQuote" ("bookingApplicationId") WHERE "isCurrent" = true;

CREATE INDEX "BookingApplication_expiry_work_idx"
  ON "BookingApplication" ("expiresAt", "id")
  WHERE "status" NOT IN ('FINALIZED', 'EXPIRED', 'CANCELLED', 'REJECTED');

CREATE OR REPLACE FUNCTION assert_booking_application_ready(application_id text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  app "BookingApplication"%ROWTYPE;
  session_row "DocumentUploadSession"%ROWTYPE;
  legal_config "LegalAcceptanceConfigVersion"%ROWTYPE;
BEGIN
  SELECT * INTO app FROM "BookingApplication" WHERE id = application_id;
  IF app.id IS NULL OR CURRENT_TIMESTAMP >= app."expiresAt" THEN
    RAISE EXCEPTION 'Booking application is absent or expired';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "BookingApplicationCustomerDriver" value
    WHERE value."bookingApplicationId" = app.id
      AND value."customerDriverConfigVersionId" = app."customerDriverConfigVersionId"
      AND value."validationStatus" IN ('VALID', 'WARNING') AND value."validatedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Booking application customer/driver evidence is not ready';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "BookingApplicationInsuranceSelection" value
    WHERE value."bookingApplicationId" = app.id
      AND value."insuranceConfigVersionId" = app."insuranceConfigVersionId"
      AND value.currency = (SELECT currency FROM "GeneralRentalConfigVersion" WHERE "configurationVersionId" = app."generalRentalConfigVersionId")
      AND value."quotedSubtotal" = CASE WHEN value.selected THEN value."unitPrice" * value."billableDays" ELSE 0 END
      AND ((value."requirementMode" = 'MANDATORY' AND value.selected) OR
           (value."requirementMode" = 'DISABLED' AND NOT value.selected) OR
           value."requirementMode" = 'OPTIONAL')
      AND ((value."availabilityScope" = 'ALL_VEHICLES' AND value."availabilityVehicleId" IS NULL) OR
           (value."availabilityScope" = 'SELECTED_VEHICLES' AND value."availabilityVehicleId" = app."carId" AND EXISTS (
             SELECT 1 FROM "InsuranceVehicleAvailability" availability
             WHERE availability."insuranceConfigVersionId" = app."insuranceConfigVersionId"
               AND availability."carId" = app."carId" AND availability.available = true
           )))
  ) THEN
    RAISE EXCEPTION 'Booking application insurance selection is not ready';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "BookingApplicationPaymentSelection" value
    JOIN "PaymentMethodRule" method
      ON method."paymentConfigVersionId" = value."paymentConfigVersionId"
     AND method.method = value."configuredPaymentMode" AND method.enabled = true
    LEFT JOIN "PaymentInstructionTranslation" instruction
      ON instruction.id = value."paymentInstructionTranslationId"
    WHERE value."bookingApplicationId" = app.id
      AND value."paymentConfigVersionId" = app."paymentConfigVersionId"
      AND value."bookingPaymentMethod" = app."paymentMethod"
      AND value.currency = (SELECT currency FROM "GeneralRentalConfigVersion" WHERE "configurationVersionId" = app."generalRentalConfigVersionId")
      AND (instruction.id IS NULL OR instruction."paymentConfigVersionId" = app."paymentConfigVersionId")
      AND value."quotedDepositAmount" = CASE value."depositType"
        WHEN 'NONE' THEN 0
        WHEN 'FIXED_AMOUNT' THEN value."depositValue"
        WHEN 'PERCENTAGE_BPS' THEN round((SELECT quote."grandTotal" FROM "BookingApplicationPricingQuote" quote
          WHERE quote."bookingApplicationId" = app.id AND quote."isCurrent" = true) * value."depositValue" / 10000.0)::integer
      END
  ) THEN
    RAISE EXCEPTION 'Booking application payment selection is not ready';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "BookingApplicationPricingQuote" quote
    WHERE quote."bookingApplicationId" = app.id AND quote."isCurrent" = true
      AND quote."configurationReleaseId" = app."configurationReleaseId"
      AND quote."pricingConfigVersionId" = app."pricingBillingConfigVersionId"
      AND quote."fleetRateSetId" = app."fleetRateSetId"
      AND quote."expiresAt" > CURRENT_TIMESTAMP
      AND (NOT quote."requiresCustomerConfirmation" OR
           (quote."confirmedAt" IS NOT NULL AND quote."confirmedByUserId" = app."customerUserId"))
  ) THEN
    RAISE EXCEPTION 'Booking application current price quote is absent, expired, or unconfirmed';
  END IF;

  SELECT * INTO legal_config FROM "LegalAcceptanceConfigVersion"
  WHERE "configurationVersionId" = app."legalAcceptanceConfigVersionId";
  IF legal_config."termsAcceptance" = 'REQUIRED' AND NOT EXISTS (
    SELECT 1 FROM "BookingApplicationLegalAcceptance" evidence
    WHERE evidence."bookingApplicationId" = app.id AND evidence."documentType" = 'RENTAL_TERMS'
      AND evidence."acceptanceRound" = app."legalAcceptanceRound" AND evidence.accepted = true
      AND evidence."legalDocumentVersionId" = legal_config."termsDocumentVersionId"
  ) THEN
    RAISE EXCEPTION 'Current rental terms acceptance is missing';
  END IF;
  IF legal_config."privacyAcknowledgment" = 'REQUIRED' AND NOT EXISTS (
    SELECT 1 FROM "BookingApplicationLegalAcceptance" evidence
    WHERE evidence."bookingApplicationId" = app.id AND evidence."documentType" = 'PRIVACY_NOTICE'
      AND evidence."acceptanceRound" = app."legalAcceptanceRound" AND evidence.accepted = true
      AND evidence."legalDocumentVersionId" = legal_config."privacyDocumentVersionId"
  ) THEN
    RAISE EXCEPTION 'Current privacy acknowledgement is missing';
  END IF;

  SELECT * INTO session_row FROM "DocumentUploadSession"
  WHERE "bookingApplicationId" = app.id;
  IF session_row.id IS NULL OR session_row.status <> 'OPEN' OR CURRENT_TIMESTAMP >= session_row."expiresAt" OR
     session_row."customerUserId" <> app."customerUserId" OR session_row."carId" <> app."carId" OR
     session_row."pickupAt" <> app."pickupAt" OR session_row."returnAt" <> app."returnAt" OR
     session_row.locale <> app.locale OR session_row."configurationReleaseId" <> app."configurationReleaseId" OR
     session_row."documentPolicyConfigVersionId" <> app."documentPolicyConfigVersionId" THEN
    RAISE EXCEPTION 'Booking application upload session is absent, expired, or has invalid provenance';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "DocumentRequirementRule" rule
    JOIN "DocumentTypeDefinition" definition ON definition.id = rule."documentTypeId"
    CROSS JOIN LATERAL generate_series(1, rule."fileCount") slot_number
    CROSS JOIN LATERAL unnest(CASE WHEN rule.sides = 'FRONT_AND_BACK'
      THEN ARRAY['FRONT', 'BACK']::"DocumentSide"[] ELSE ARRAY['SINGLE']::"DocumentSide"[] END) side_value
    WHERE rule."documentPolicyConfigVersionId" = app."documentPolicyConfigVersionId"
      AND rule.mode = 'REQUIRED'
      AND NOT (
        (SELECT "identityDocumentChoice" FROM "DocumentPolicyConfigVersion"
          WHERE "configurationVersionId" = app."documentPolicyConfigVersionId") = 'EITHER_IDENTITY_CARD_OR_PASSPORT'
        AND definition.key IN ('IDENTITY_CARD', 'PASSPORT')
      )
      AND NOT EXISTS (
        SELECT 1 FROM "CustomerDocument" document
        WHERE document."uploadSessionId" = session_row.id
          AND document."customerUserId" = app."customerUserId"
          AND document."configurationReleaseId" = app."configurationReleaseId"
          AND document."documentPolicyConfigVersionId" = app."documentPolicyConfigVersionId"
          AND document."documentTypeId" = rule."documentTypeId"
          AND document."slotNumber" = slot_number AND document.side = side_value
          AND document."isCurrent" = true AND document."deletionStatus" = 'RETAINED'
          AND document."retentionUntil" > CURRENT_TIMESTAMP
          AND ((document."uploadStatus" = 'READY' AND document."scanStatus" = 'CLEAN') OR
               (document."uploadStatus" = 'TECHNICALLY_VALID' AND document."scanStatus" = 'NOT_AVAILABLE'
                AND document."scanAttemptCount" = 0 AND document."manualReviewStatus" = 'APPROVED'))
      )
  ) THEN
    RAISE EXCEPTION 'Required customer document evidence is incomplete';
  END IF;

  IF (SELECT "identityDocumentChoice" FROM "DocumentPolicyConfigVersion"
      WHERE "configurationVersionId" = app."documentPolicyConfigVersionId") = 'EITHER_IDENTITY_CARD_OR_PASSPORT'
     AND NOT EXISTS (
       SELECT 1 FROM "CustomerDocument" document
       JOIN "DocumentTypeDefinition" definition ON definition.id = document."documentTypeId"
       WHERE document."uploadSessionId" = session_row.id AND definition.key IN ('IDENTITY_CARD', 'PASSPORT')
         AND document."customerUserId" = app."customerUserId"
         AND document."configurationReleaseId" = app."configurationReleaseId"
         AND document."documentPolicyConfigVersionId" = app."documentPolicyConfigVersionId"
         AND document."isCurrent" = true AND document."deletionStatus" = 'RETAINED'
         AND document."retentionUntil" > CURRENT_TIMESTAMP
         AND ((document."uploadStatus" = 'READY' AND document."scanStatus" = 'CLEAN') OR
              (document."uploadStatus" = 'TECHNICALLY_VALID' AND document."scanStatus" = 'NOT_AVAILABLE'
               AND document."scanAttemptCount" = 0 AND document."manualReviewStatus" = 'APPROVED'))
     ) THEN
    RAISE EXCEPTION 'Required identity document evidence is incomplete';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_booking_application()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  provenance record;
BEGIN
  SELECT release.status AS release_status,
    release."generalRentalConfigVersionId", release."pricingBillingConfigVersionId", release."fleetRateSetId",
    release."insuranceConfigVersionId", release."customerDriverConfigVersionId", release."bookingWorkflowConfigVersionId",
    release."documentPolicyConfigVersionId", release."paymentConfigVersionId", release."confirmationConfigVersionId",
    release."legalAcceptanceConfigVersionId", general."businessTimeZone"
  INTO provenance
  FROM "BusinessConfigurationRelease" release
  JOIN "GeneralRentalConfigVersion" general ON general."configurationVersionId" = release."generalRentalConfigVersionId"
  WHERE release.id = NEW."configurationReleaseId";

  IF provenance.release_status IS NULL OR
     provenance."generalRentalConfigVersionId" <> NEW."generalRentalConfigVersionId" OR
     provenance."pricingBillingConfigVersionId" <> NEW."pricingBillingConfigVersionId" OR
     provenance."fleetRateSetId" <> NEW."fleetRateSetId" OR
     provenance."insuranceConfigVersionId" <> NEW."insuranceConfigVersionId" OR
     provenance."customerDriverConfigVersionId" <> NEW."customerDriverConfigVersionId" OR
     provenance."bookingWorkflowConfigVersionId" <> NEW."bookingWorkflowConfigVersionId" OR
     provenance."documentPolicyConfigVersionId" <> NEW."documentPolicyConfigVersionId" OR
     provenance."paymentConfigVersionId" <> NEW."paymentConfigVersionId" OR
     provenance."confirmationConfigVersionId" <> NEW."confirmationConfigVersionId" OR
     provenance."legalAcceptanceConfigVersionId" <> NEW."legalAcceptanceConfigVersionId" OR
     provenance."businessTimeZone" <> NEW."businessTimeZone" THEN
    RAISE EXCEPTION 'Booking application release provenance is inconsistent';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.revision <> 1 OR NEW.status <> 'DRAFT' OR provenance.release_status <> 'ACTIVE' OR
       NEW."expiresAt" <= CURRENT_TIMESTAMP OR NEW."bookingId" IS NOT NULL THEN
      RAISE EXCEPTION 'New booking application must be an unexpired revision-one draft on the active release';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('FINALIZED', 'EXPIRED', 'CANCELLED', 'REJECTED') THEN
    RAISE EXCEPTION 'Terminal booking application % is immutable', OLD.id;
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Booking application update requires the next revision';
  END IF;
  IF NEW.id <> OLD.id OR NEW."customerUserId" <> OLD."customerUserId" OR NEW."carId" <> OLD."carId" OR
     NEW."idempotencyKey" <> OLD."idempotencyKey" OR NEW."configurationReleaseId" <> OLD."configurationReleaseId" OR
     NEW."generalRentalConfigVersionId" <> OLD."generalRentalConfigVersionId" OR
     NEW."pricingBillingConfigVersionId" <> OLD."pricingBillingConfigVersionId" OR
     NEW."fleetRateSetId" <> OLD."fleetRateSetId" OR NEW."insuranceConfigVersionId" <> OLD."insuranceConfigVersionId" OR
     NEW."customerDriverConfigVersionId" <> OLD."customerDriverConfigVersionId" OR
     NEW."bookingWorkflowConfigVersionId" <> OLD."bookingWorkflowConfigVersionId" OR
     NEW."documentPolicyConfigVersionId" <> OLD."documentPolicyConfigVersionId" OR
     NEW."paymentConfigVersionId" <> OLD."paymentConfigVersionId" OR
     NEW."confirmationConfigVersionId" <> OLD."confirmationConfigVersionId" OR
     NEW."legalAcceptanceConfigVersionId" <> OLD."legalAcceptanceConfigVersionId" OR
     NEW."businessTimeZone" <> OLD."businessTimeZone" OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'Booking application identity and release binding are immutable';
  END IF;

  IF (NEW."pickupAt", NEW."returnAt", NEW."pickupLocation", NEW."returnLocation", NEW.locale) IS DISTINCT FROM
     (OLD."pickupAt", OLD."returnAt", OLD."pickupLocation", OLD."returnLocation", OLD.locale) AND
     NOT (NEW.status = 'CUSTOMER_ACTION_REQUIRED' AND NEW."actionRequiredReason" = 'RENTAL_DATES_CHANGED') THEN
    RAISE EXCEPTION 'Rental facts may change only through the explicit customer-action path';
  END IF;
  IF NEW."paymentMethod" <> OLD."paymentMethod" AND
     NOT (NEW.status = 'CUSTOMER_ACTION_REQUIRED' AND NEW."actionRequiredReason" = 'PAYMENT_RULES_CHANGED') THEN
    RAISE EXCEPTION 'Payment method may change only through the explicit customer-action path';
  END IF;
  IF NEW."legalAcceptanceRound" < OLD."legalAcceptanceRound" OR
     NEW."legalAcceptanceRound" > OLD."legalAcceptanceRound" + 1 THEN
    RAISE EXCEPTION 'Legal acceptance round is monotonic';
  END IF;
  IF NEW."legalAcceptanceRound" = OLD."legalAcceptanceRound" + 1 AND NEW.status <> 'CUSTOMER_ACTION_REQUIRED' THEN
    RAISE EXCEPTION 'A new legal acceptance round requires customer action';
  END IF;

  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'DRAFT' AND NEW.status = 'AWAITING_DOCUMENT_UPLOAD') OR
    (OLD.status = 'AWAITING_DOCUMENT_UPLOAD' AND NEW.status IN ('AWAITING_DOCUMENT_REVIEW', 'CUSTOMER_ACTION_REQUIRED')) OR
    (OLD.status = 'AWAITING_DOCUMENT_REVIEW' AND NEW.status IN ('AWAITING_DOCUMENT_UPLOAD', 'CUSTOMER_ACTION_REQUIRED', 'READY_TO_FINALIZE')) OR
    (OLD.status = 'CUSTOMER_ACTION_REQUIRED' AND NEW.status IN ('AWAITING_DOCUMENT_UPLOAD', 'AWAITING_DOCUMENT_REVIEW', 'READY_TO_FINALIZE')) OR
    (OLD.status = 'READY_TO_FINALIZE' AND NEW.status IN ('FINALIZING', 'CUSTOMER_ACTION_REQUIRED')) OR
    (OLD.status = 'FINALIZING' AND NEW.status = 'FINALIZED') OR
    (NEW.status IN ('EXPIRED', 'CANCELLED', 'REJECTED') AND OLD.status <> 'FINALIZING')
  ) THEN
    RAISE EXCEPTION 'Invalid booking application transition % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'EXPIRED' AND CURRENT_TIMESTAMP < NEW."expiresAt" THEN
    RAISE EXCEPTION 'Booking application cannot expire before expiresAt';
  END IF;
  IF OLD.status <> NEW.status AND NEW.status <> 'EXPIRED' AND CURRENT_TIMESTAMP >= NEW."expiresAt" THEN
    RAISE EXCEPTION 'Expired booking application cannot advance';
  END IF;

  NEW."lastActivityAt" := transaction_timestamp();
  IF OLD.status = 'DRAFT' AND NEW.status = 'AWAITING_DOCUMENT_UPLOAD' THEN
    NEW."submittedAt" := COALESCE(NEW."submittedAt", transaction_timestamp());
  END IF;
  IF NEW.status = 'READY_TO_FINALIZE' AND OLD.status <> 'READY_TO_FINALIZE' THEN
    PERFORM assert_booking_application_ready(NEW.id);
    NEW."readyAt" := COALESCE(NEW."readyAt", transaction_timestamp());
  END IF;
  IF NEW.status = 'FINALIZING' AND OLD.status <> 'FINALIZING' THEN
    PERFORM assert_booking_application_ready(NEW.id);
  END IF;
  IF NEW.status = 'FINALIZED' THEN
    NEW."finalizedAt" := COALESCE(NEW."finalizedAt", transaction_timestamp());
  ELSIF NEW.status = 'CANCELLED' THEN
    NEW."cancelledAt" := COALESCE(NEW."cancelledAt", transaction_timestamp());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "BookingApplication_lifecycle"
BEFORE INSERT OR UPDATE ON "BookingApplication"
FOR EACH ROW EXECUTE FUNCTION enforce_booking_application();

CREATE OR REPLACE FUNCTION prevent_booking_application_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Booking application lifecycle rows cannot be deleted';
END;
$$;

CREATE TRIGGER "BookingApplication_no_delete"
BEFORE DELETE ON "BookingApplication"
FOR EACH ROW EXECUTE FUNCTION prevent_booking_application_delete();

CREATE OR REPLACE FUNCTION enforce_booking_application_child()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  app "BookingApplication"%ROWTYPE;
  config_value text;
BEGIN
  SELECT * INTO app FROM "BookingApplication"
  WHERE id = COALESCE(NEW."bookingApplicationId", OLD."bookingApplicationId") FOR SHARE;
  IF app.id IS NULL OR app.status NOT IN ('DRAFT', 'AWAITING_DOCUMENT_UPLOAD', 'AWAITING_DOCUMENT_REVIEW', 'CUSTOMER_ACTION_REQUIRED') OR
     CURRENT_TIMESTAMP >= app."expiresAt" THEN
    RAISE EXCEPTION 'Booking application child evidence is not mutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  config_value := CASE TG_TABLE_NAME
    WHEN 'BookingApplicationCustomerDriver' THEN app."customerDriverConfigVersionId"
    WHEN 'BookingApplicationInsuranceSelection' THEN app."insuranceConfigVersionId"
    WHEN 'BookingApplicationPaymentSelection' THEN app."paymentConfigVersionId"
  END;
  IF (to_jsonb(NEW)->>CASE TG_TABLE_NAME
      WHEN 'BookingApplicationCustomerDriver' THEN 'customerDriverConfigVersionId'
      WHEN 'BookingApplicationInsuranceSelection' THEN 'insuranceConfigVersionId'
      WHEN 'BookingApplicationPaymentSelection' THEN 'paymentConfigVersionId' END) <> config_value THEN
    RAISE EXCEPTION 'Booking application child configuration provenance is inconsistent';
  END IF;
  IF TG_TABLE_NAME = 'BookingApplicationInsuranceSelection' AND
     to_jsonb(NEW)->>'availabilityVehicleId' IS NOT NULL AND
     to_jsonb(NEW)->>'availabilityVehicleId' <> app."carId" THEN
    RAISE EXCEPTION 'Application insurance availability vehicle must match the application vehicle';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.revision <> 1 THEN
    RAISE EXCEPTION 'New booking application child must start at revision one';
  ELSIF TG_OP = 'UPDATE' AND (NEW."bookingApplicationId" <> OLD."bookingApplicationId" OR NEW.id <> OLD.id OR
                              NEW.revision <> OLD.revision + 1) THEN
    RAISE EXCEPTION 'Booking application child update has stale revision or changed identity';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "BookingApplicationCustomerDriver_lifecycle"
BEFORE INSERT OR UPDATE OR DELETE ON "BookingApplicationCustomerDriver"
FOR EACH ROW EXECUTE FUNCTION enforce_booking_application_child();
CREATE TRIGGER "BookingApplicationInsuranceSelection_lifecycle"
BEFORE INSERT OR UPDATE OR DELETE ON "BookingApplicationInsuranceSelection"
FOR EACH ROW EXECUTE FUNCTION enforce_booking_application_child();
CREATE TRIGGER "BookingApplicationPaymentSelection_lifecycle"
BEFORE INSERT OR UPDATE OR DELETE ON "BookingApplicationPaymentSelection"
FOR EACH ROW EXECUTE FUNCTION enforce_booking_application_child();

CREATE OR REPLACE FUNCTION enforce_booking_application_quote()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  app "BookingApplication"%ROWTYPE;
  release_number_value integer;
  pricing_number_value integer;
  rate_set_number_value integer;
  rate_record record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Booking application quote evidence cannot be deleted';
  END IF;
  SELECT * INTO app FROM "BookingApplication" WHERE id = NEW."bookingApplicationId" FOR SHARE;
  IF app.id IS NULL OR app.status NOT IN ('DRAFT', 'AWAITING_DOCUMENT_UPLOAD', 'AWAITING_DOCUMENT_REVIEW', 'CUSTOMER_ACTION_REQUIRED') OR
     CURRENT_TIMESTAMP >= app."expiresAt" THEN
    RAISE EXCEPTION 'Booking application quote cannot be changed in this lifecycle state';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT "releaseNumber" INTO release_number_value FROM "BusinessConfigurationRelease" WHERE id = NEW."configurationReleaseId";
    SELECT version."versionNumber" INTO pricing_number_value FROM "PricingBillingConfigVersion" config
      JOIN "ConfigurationVersion" version ON version.id = config."configurationVersionId"
      WHERE config."configurationVersionId" = NEW."pricingConfigVersionId";
    SELECT "versionNumber" INTO rate_set_number_value FROM "FleetRateSet" WHERE id = NEW."fleetRateSetId";
    SELECT rate."fleetRateSetId", rate."carId" INTO rate_record FROM "VehicleRentalRate" rate WHERE rate.id = NEW."vehicleRentalRateId";
    IF NEW."configurationReleaseId" <> app."configurationReleaseId" OR
       NEW."pricingConfigVersionId" <> app."pricingBillingConfigVersionId" OR NEW."fleetRateSetId" <> app."fleetRateSetId" OR
       NEW."releaseNumber" <> release_number_value OR NEW."pricingVersionNumber" <> pricing_number_value OR
       NEW."fleetRateSetVersionNumber" <> rate_set_number_value OR rate_record."fleetRateSetId" <> app."fleetRateSetId" OR
       rate_record."carId" <> app."carId" OR NEW."rateSourceType" <> 'FLEET_RATE_SET' OR
       NEW."rateSourceReference" <> NEW."vehicleRentalRateId" OR NEW.currency <>
         (SELECT currency FROM "GeneralRentalConfigVersion" WHERE "configurationVersionId" = app."generalRentalConfigVersionId") THEN
      RAISE EXCEPTION 'Booking application quote provenance is inconsistent';
    END IF;
    IF NEW."quoteVersion" = 1 AND EXISTS (
      SELECT 1 FROM "BookingApplicationPricingQuote" WHERE "bookingApplicationId" = app.id
    ) THEN
      RAISE EXCEPTION 'Initial quote version may only be inserted once';
    END IF;
    IF NEW."quoteVersion" > 1 AND NOT EXISTS (
      SELECT 1 FROM "BookingApplicationPricingQuote" previous
      WHERE previous.id = NEW."supersedesPricingQuoteId" AND previous."bookingApplicationId" = app.id
        AND previous."quoteVersion" = NEW."quoteVersion" - 1 AND previous."isCurrent" = false
    ) THEN
      RAISE EXCEPTION 'Renewed quote must supersede the immediately prior non-current quote';
    END IF;
    IF NEW."confirmedAt" IS NOT NULL AND NEW."confirmedByUserId" <> app."customerUserId" THEN
      RAISE EXCEPTION 'Quote confirmation must belong to the application owner';
    END IF;
    IF NEW."confirmedAt" IS NOT NULL THEN
      NEW."confirmedAt" := transaction_timestamp();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."bookingApplicationId" <> OLD."bookingApplicationId" OR NEW.id <> OLD.id OR
     (to_jsonb(NEW) - 'isCurrent' - 'confirmedAt' - 'confirmedByUserId') <>
     (to_jsonb(OLD) - 'isCurrent' - 'confirmedAt' - 'confirmedByUserId') OR
     (OLD."isCurrent" = false AND NEW."isCurrent" = true) OR
     (OLD."confirmedAt" IS NOT NULL AND (NEW."confirmedAt", NEW."confirmedByUserId") IS DISTINCT FROM
       (OLD."confirmedAt", OLD."confirmedByUserId")) OR
     (OLD."confirmedAt" IS NULL AND NEW."confirmedAt" IS NOT NULL AND NEW."confirmedByUserId" <> app."customerUserId") THEN
    RAISE EXCEPTION 'Booking application quote evidence is immutable except demotion and owner confirmation';
  END IF;
  IF OLD."confirmedAt" IS NULL AND NEW."confirmedAt" IS NOT NULL THEN
    NEW."confirmedAt" := transaction_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "BookingApplicationPricingQuote_lifecycle"
BEFORE INSERT OR UPDATE OR DELETE ON "BookingApplicationPricingQuote"
FOR EACH ROW EXECUTE FUNCTION enforce_booking_application_quote();

CREATE OR REPLACE FUNCTION enforce_booking_application_legal_acceptance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  app "BookingApplication"%ROWTYPE;
  translation_record record;
  expected_version_id text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Booking application legal acceptance evidence is append-only';
  END IF;
  SELECT * INTO app FROM "BookingApplication" WHERE id = NEW."bookingApplicationId" FOR SHARE;
  SELECT translation."legalDocumentVersionId", translation.locale, translation."contentHash",
         version.type, version."versionNumber", translation."canonicalContent"
    INTO translation_record
  FROM "LegalDocumentTranslation" translation
  JOIN "LegalDocumentVersion" version ON version.id = translation."legalDocumentVersionId"
  WHERE translation.id = NEW."legalDocumentTranslationId";
  expected_version_id := CASE NEW."documentType"
    WHEN 'RENTAL_TERMS' THEN (SELECT "termsDocumentVersionId" FROM "LegalAcceptanceConfigVersion"
      WHERE "configurationVersionId" = app."legalAcceptanceConfigVersionId")
    WHEN 'PRIVACY_NOTICE' THEN (SELECT "privacyDocumentVersionId" FROM "LegalAcceptanceConfigVersion"
      WHERE "configurationVersionId" = app."legalAcceptanceConfigVersionId")
  END;
  IF app.id IS NULL OR app.status NOT IN ('DRAFT', 'AWAITING_DOCUMENT_UPLOAD', 'AWAITING_DOCUMENT_REVIEW', 'CUSTOMER_ACTION_REQUIRED') OR
     CURRENT_TIMESTAMP >= app."expiresAt" OR NEW."customerUserId" <> app."customerUserId" OR
     NEW."configurationReleaseId" <> app."configurationReleaseId" OR
     NEW."legalAcceptanceConfigVersionId" <> app."legalAcceptanceConfigVersionId" OR
     NEW."acceptanceRound" <> app."legalAcceptanceRound" OR
     NEW."legalDocumentVersionId" <> expected_version_id OR NEW."legalDocumentVersionId" <> translation_record."legalDocumentVersionId" OR
     NEW."documentType" <> translation_record.type OR NEW."documentVersionNumber" <> translation_record."versionNumber" OR
     NEW.locale <> translation_record.locale OR NEW."contentHash" <> translation_record."contentHash" OR
     (NEW."contentSnapshot" IS NOT NULL AND NEW."contentSnapshot" <> translation_record."canonicalContent") OR
     ((SELECT "retainContentSnapshot" FROM "LegalAcceptanceConfigVersion"
        WHERE "configurationVersionId" = app."legalAcceptanceConfigVersionId") AND
       NEW."contentSnapshot" IS DISTINCT FROM translation_record."canonicalContent") THEN
    RAISE EXCEPTION 'Booking application legal acceptance provenance is inconsistent';
  END IF;
  NEW."acceptedAt" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "BookingApplicationLegalAcceptance_append_only"
BEFORE INSERT OR UPDATE OR DELETE ON "BookingApplicationLegalAcceptance"
FOR EACH ROW EXECUTE FUNCTION enforce_booking_application_legal_acceptance();

-- Extend the Phase 8 upload-session guard without changing historical rows.
CREATE OR REPLACE FUNCTION enforce_document_upload_session()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  release_policy text;
  booking_user text;
  booking_car text;
  booking_pickup timestamp(3);
  booking_return timestamp(3);
  booking_release text;
  app "BookingApplication"%ROWTYPE;
BEGIN
  SELECT "documentPolicyConfigVersionId" INTO release_policy
  FROM "BusinessConfigurationRelease" WHERE id = NEW."configurationReleaseId";
  IF release_policy IS NULL OR release_policy <> NEW."documentPolicyConfigVersionId" THEN
    RAISE EXCEPTION 'Document upload session release/policy provenance is inconsistent';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> NEW.status AND NOT (OLD.status = 'OPEN' AND NEW.status IN ('CONSUMED', 'EXPIRED', 'ABORTED')) THEN
      RAISE EXCEPTION 'Invalid document upload session transition % -> %', OLD.status, NEW.status;
    END IF;
    IF OLD.status <> NEW.status AND NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'Document upload session transition requires the next revision';
    END IF;
    IF OLD.status <> 'OPEN' AND to_jsonb(NEW) <> to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Terminal document upload session % is immutable', OLD.id;
    END IF;
    IF NEW."customerUserId" <> OLD."customerUserId" OR NEW."carId" <> OLD."carId" OR
       NEW."configurationReleaseId" <> OLD."configurationReleaseId" OR
       NEW."documentPolicyConfigVersionId" <> OLD."documentPolicyConfigVersionId" OR
       NEW."pickupAt" <> OLD."pickupAt" OR NEW."returnAt" <> OLD."returnAt" OR
       NEW.locale <> OLD.locale OR
       (OLD."bookingApplicationId" IS NOT NULL AND NEW."bookingApplicationId" IS DISTINCT FROM OLD."bookingApplicationId") THEN
      RAISE EXCEPTION 'Document upload session binding is immutable';
    END IF;
    IF OLD."bookingApplicationId" IS NULL AND NEW."bookingApplicationId" IS NOT NULL AND OLD.status <> 'OPEN' THEN
      RAISE EXCEPTION 'Only an open historical upload session may be bound to an application';
    END IF;
    IF OLD."bookingApplicationId" IS DISTINCT FROM NEW."bookingApplicationId" AND NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'Upload session application binding requires the next revision';
    END IF;
    IF NEW.status = 'EXPIRED' AND CURRENT_TIMESTAMP < NEW."expiresAt" THEN
      RAISE EXCEPTION 'Document upload session cannot expire before expiresAt';
    END IF;
  END IF;

  IF NEW."bookingApplicationId" IS NOT NULL THEN
    SELECT * INTO app FROM "BookingApplication" WHERE id = NEW."bookingApplicationId";
    IF app.id IS NULL OR app.status IN ('FINALIZED', 'EXPIRED', 'CANCELLED', 'REJECTED') OR
       CURRENT_TIMESTAMP >= app."expiresAt" OR app."customerUserId" <> NEW."customerUserId" OR
       app."carId" <> NEW."carId" OR app."pickupAt" <> NEW."pickupAt" OR app."returnAt" <> NEW."returnAt" OR
       app.locale <> NEW.locale OR app."configurationReleaseId" <> NEW."configurationReleaseId" OR
       app."documentPolicyConfigVersionId" <> NEW."documentPolicyConfigVersionId" THEN
      RAISE EXCEPTION 'Upload session does not match an active booking application';
    END IF;
  END IF;

  IF NEW.status = 'CONSUMED' THEN
    IF CURRENT_TIMESTAMP >= NEW."expiresAt" THEN
      RAISE EXCEPTION 'Expired document upload session cannot be consumed';
    END IF;
    SELECT booking."userId", booking."carId", booking."pickupDate", booking."dropoffDate", pricing."configurationReleaseId"
      INTO booking_user, booking_car, booking_pickup, booking_return, booking_release
    FROM "Booking" booking JOIN "BookingPricingSnapshot" pricing ON pricing."bookingId" = booking.id
    WHERE booking.id = NEW."bookingId";
    IF booking_user IS NULL OR booking_user <> NEW."customerUserId" OR booking_car <> NEW."carId" OR
       booking_pickup <> NEW."pickupAt" OR booking_return <> NEW."returnAt" OR
       booking_release IS NULL OR booking_release <> NEW."configurationReleaseId" OR
       (NEW."bookingApplicationId" IS NOT NULL AND (app.status <> 'FINALIZING' OR app."bookingId" <> NEW."bookingId")) THEN
      RAISE EXCEPTION 'Consumed document upload session does not match Booking/application evidence';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_application_upload_intent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  app_status "BookingApplicationStatus";
  app_expiry timestamp(3);
BEGIN
  SELECT app.status, app."expiresAt" INTO app_status, app_expiry
  FROM "DocumentUploadSession" session
  JOIN "BookingApplication" app ON app.id = session."bookingApplicationId"
  WHERE session.id = NEW."uploadSessionId";
  IF app_status IS NOT NULL AND
     (app_status NOT IN ('AWAITING_DOCUMENT_UPLOAD', 'CUSTOMER_ACTION_REQUIRED') OR CURRENT_TIMESTAMP >= app_expiry) THEN
    RAISE EXCEPTION 'Booking application does not currently permit uploads';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentUploadIntent_booking_application_guard"
BEFORE INSERT OR UPDATE ON "DocumentUploadIntent"
FOR EACH ROW EXECUTE FUNCTION guard_application_upload_intent();

CREATE OR REPLACE FUNCTION verify_booking_application_finalization()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  booking_record record;
BEGIN
  IF NEW.status <> 'FINALIZED' THEN RETURN NULL; END IF;
  SELECT booking."userId", booking."carId", booking."pickupDate", booking."dropoffDate", booking.location,
         booking."paymentMethod", booking."depositAmount", pricing."configurationReleaseId", pricing."grandTotal",
         session.status AS session_status, session."bookingId" AS session_booking_id
    INTO booking_record
  FROM "Booking" booking
  JOIN "BookingPricingSnapshot" pricing ON pricing."bookingId" = booking.id
  JOIN "DocumentUploadSession" session ON session."bookingApplicationId" = NEW.id
  WHERE booking.id = NEW."bookingId";
  IF booking_record."userId" IS NULL OR booking_record."userId" <> NEW."customerUserId" OR
     booking_record."carId" <> NEW."carId" OR booking_record."pickupDate" <> NEW."pickupAt" OR
     booking_record."dropoffDate" <> NEW."returnAt" OR booking_record.location <> NEW."pickupLocation" OR
     booking_record."paymentMethod" <> NEW."paymentMethod" OR
     booking_record."configurationReleaseId" <> NEW."configurationReleaseId" OR
     booking_record.session_status <> 'CONSUMED' OR booking_record.session_booking_id <> NEW."bookingId" OR
     NOT EXISTS (
       SELECT 1 FROM "BookingApplicationPaymentSelection" payment
       WHERE payment."bookingApplicationId" = NEW.id
         AND payment."bookingPaymentMethod" = booking_record."paymentMethod"
         AND payment."quotedDepositAmount" = booking_record."depositAmount"
     ) OR
     NOT EXISTS (
       SELECT 1 FROM "BookingCustomerDriverSnapshot" snapshot
       JOIN "BookingApplicationCustomerDriver" application_value ON application_value."bookingApplicationId" = NEW.id
       WHERE snapshot."bookingId" = NEW."bookingId"
         AND snapshot."customerDriverConfigVersionId" = NEW."customerDriverConfigVersionId"
         AND snapshot."firstName" IS NOT DISTINCT FROM application_value."firstName"
         AND snapshot."lastName" IS NOT DISTINCT FROM application_value."lastName"
         AND snapshot.email IS NOT DISTINCT FROM application_value.email
         AND snapshot."licenceNumber" IS NOT DISTINCT FROM application_value."licenceNumber"
     ) OR
     NOT EXISTS (
       SELECT 1 FROM "BookingInsuranceSnapshot" snapshot
       JOIN "BookingApplicationInsuranceSelection" application_value ON application_value."bookingApplicationId" = NEW.id
       WHERE snapshot."bookingId" = NEW."bookingId"
         AND snapshot."insuranceConfigVersionId" = NEW."insuranceConfigVersionId"
         AND snapshot.selected = application_value.selected
         AND snapshot.subtotal = application_value."quotedSubtotal"
         AND snapshot.currency = application_value.currency
     ) OR
     (SELECT count(*) FROM "BookingLegalAcceptance" evidence
       JOIN "BookingApplicationLegalAcceptance" application_evidence
         ON application_evidence."bookingApplicationId" = NEW.id
        AND application_evidence."acceptanceRound" = NEW."legalAcceptanceRound"
        AND application_evidence."documentType" = evidence."documentType"
        AND application_evidence."legalDocumentTranslationId" = evidence."legalDocumentTranslationId"
        AND application_evidence."contentHash" = evidence."contentHash"
       WHERE evidence."bookingId" = NEW."bookingId") <
       (SELECT count(*) FROM "BookingApplicationLegalAcceptance" application_evidence
        WHERE application_evidence."bookingApplicationId" = NEW.id
          AND application_evidence."acceptanceRound" = NEW."legalAcceptanceRound") OR
     NOT EXISTS (
       SELECT 1 FROM "BookingApplicationPricingQuote" quote
       WHERE quote."bookingApplicationId" = NEW.id AND quote."isCurrent" = true
         AND quote."grandTotal" = booking_record."grandTotal"
     ) THEN
    RAISE EXCEPTION 'Finalized booking does not match its application evidence';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "BookingApplication_finalization_consistency"
AFTER INSERT OR UPDATE ON "BookingApplication"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION verify_booking_application_finalization();
