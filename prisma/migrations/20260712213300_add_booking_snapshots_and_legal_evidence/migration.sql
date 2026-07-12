
-- Phase 2B migration 4/6: optional booking-owned snapshots and legal evidence.
-- Existing Booking rows remain valid without any snapshot child row.

-- CreateTable
CREATE TABLE "BookingPricingSnapshot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "configurationReleaseId" TEXT NOT NULL,
    "pricingConfigVersionId" TEXT NOT NULL,
    "fleetRateSetId" TEXT NOT NULL,
    "vehicleRentalRateId" TEXT NOT NULL,
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "releaseNumber" INTEGER NOT NULL,
    "pricingVersionNumber" INTEGER NOT NULL,
    "fleetRateSetVersionNumber" INTEGER NOT NULL,
    "pricingEngineVersion" TEXT NOT NULL,
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
    "calculationTrace" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingPricingSnapshot_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "BookingCustomerDriverSnapshot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
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
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingCustomerDriverSnapshot_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "BookingInsuranceSnapshot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "insuranceConfigVersionId" TEXT NOT NULL,
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "selected" BOOLEAN NOT NULL,
    "requirementMode" "InsuranceRequirementMode" NOT NULL,
    "customerFacingName" TEXT NOT NULL,
    "description" TEXT,
    "unitPrice" INTEGER NOT NULL,
    "billableDays" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "taxTreatment" "InsuranceTaxTreatment" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingInsuranceSnapshot_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "BookingLegalAcceptance" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "legalDocumentTranslationId" TEXT NOT NULL,
    "customerUserId" TEXT,
    "documentType" "LegalDocumentType" NOT NULL,
    "documentVersionNumber" INTEGER NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "source" "LegalAcceptanceSource" NOT NULL,
    "contentSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingLegalAcceptance_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE UNIQUE INDEX "BookingPricingSnapshot_bookingId_key" ON "BookingPricingSnapshot"("bookingId");


-- CreateIndex
CREATE INDEX "BookingPricingSnapshot_configurationReleaseId_idx" ON "BookingPricingSnapshot"("configurationReleaseId");


-- CreateIndex
CREATE INDEX "BookingPricingSnapshot_pricingConfigVersionId_idx" ON "BookingPricingSnapshot"("pricingConfigVersionId");


-- CreateIndex
CREATE INDEX "BookingPricingSnapshot_fleetRateSetId_idx" ON "BookingPricingSnapshot"("fleetRateSetId");


-- CreateIndex
CREATE INDEX "BookingPricingSnapshot_vehicleRentalRateId_idx" ON "BookingPricingSnapshot"("vehicleRentalRateId");


-- CreateIndex
CREATE INDEX "BookingPricingSnapshot_calculatedAt_idx" ON "BookingPricingSnapshot"("calculatedAt");


-- CreateIndex
CREATE UNIQUE INDEX "BookingCustomerDriverSnapshot_bookingId_key" ON "BookingCustomerDriverSnapshot"("bookingId");


-- CreateIndex
CREATE UNIQUE INDEX "BookingInsuranceSnapshot_bookingId_key" ON "BookingInsuranceSnapshot"("bookingId");


-- CreateIndex
CREATE INDEX "BookingInsuranceSnapshot_insuranceConfigVersionId_idx" ON "BookingInsuranceSnapshot"("insuranceConfigVersionId");


-- CreateIndex
CREATE INDEX "BookingLegalAcceptance_legalDocumentTranslationId_idx" ON "BookingLegalAcceptance"("legalDocumentTranslationId");


-- CreateIndex
CREATE INDEX "BookingLegalAcceptance_customerUserId_acceptedAt_idx" ON "BookingLegalAcceptance"("customerUserId", "acceptedAt");


-- CreateIndex
CREATE INDEX "BookingLegalAcceptance_documentType_acceptedAt_idx" ON "BookingLegalAcceptance"("documentType", "acceptedAt");


-- CreateIndex
CREATE UNIQUE INDEX "BookingLegalAcceptance_bookingId_documentType_key" ON "BookingLegalAcceptance"("bookingId", "documentType");


-- AddForeignKey
ALTER TABLE "BookingPricingSnapshot" ADD CONSTRAINT "BookingPricingSnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingPricingSnapshot" ADD CONSTRAINT "BookingPricingSnapshot_configurationReleaseId_fkey" FOREIGN KEY ("configurationReleaseId") REFERENCES "BusinessConfigurationRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingPricingSnapshot" ADD CONSTRAINT "BookingPricingSnapshot_pricingConfigVersionId_fkey" FOREIGN KEY ("pricingConfigVersionId") REFERENCES "PricingBillingConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingPricingSnapshot" ADD CONSTRAINT "BookingPricingSnapshot_fleetRateSetId_fkey" FOREIGN KEY ("fleetRateSetId") REFERENCES "FleetRateSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingPricingSnapshot" ADD CONSTRAINT "BookingPricingSnapshot_vehicleRentalRateId_fkey" FOREIGN KEY ("vehicleRentalRateId") REFERENCES "VehicleRentalRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingCustomerDriverSnapshot" ADD CONSTRAINT "BookingCustomerDriverSnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingInsuranceSnapshot" ADD CONSTRAINT "BookingInsuranceSnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingInsuranceSnapshot" ADD CONSTRAINT "BookingInsuranceSnapshot_insuranceConfigVersionId_fkey" FOREIGN KEY ("insuranceConfigVersionId") REFERENCES "InsuranceConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingLegalAcceptance" ADD CONSTRAINT "BookingLegalAcceptance_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingLegalAcceptance" ADD CONSTRAINT "BookingLegalAcceptance_legalDocumentTranslationId_fkey" FOREIGN KEY ("legalDocumentTranslationId") REFERENCES "LegalDocumentTranslation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingLegalAcceptance" ADD CONSTRAINT "BookingLegalAcceptance_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
