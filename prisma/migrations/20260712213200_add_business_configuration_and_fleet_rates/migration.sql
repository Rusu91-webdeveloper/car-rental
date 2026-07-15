
-- Phase 2B migration 3/6: typed configuration domains, atomic release manifest,
-- reference vocabularies, and immutable fleet-rate-set structure.
-- Car.price remains unchanged. No release or rate set is activated here.

-- CreateTable
CREATE TABLE "ConfigurationVersion" (
    "id" TEXT NOT NULL,
    "domain" "ConfigurationDomainType" NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ConfigurationVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "validationStatus" "ConfigurationValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "changeSummary" TEXT NOT NULL,
    "validationSnapshot" JSONB,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "validatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ConfigurationVersion_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "DocumentTypeDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTypeDefinition_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "ConfirmationSectionDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfirmationSectionDefinition_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "GeneralRentalConfigVersion" (
    "configurationVersionId" TEXT NOT NULL,
    "businessTimeZone" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "supportedLocales" TEXT[],

    CONSTRAINT "GeneralRentalConfigVersion_pkey" PRIMARY KEY ("configurationVersionId")
);


-- CreateTable
CREATE TABLE "PricingBillingConfigVersion" (
    "configurationVersionId" TEXT NOT NULL,
    "weeklyPricingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "monthlyPricingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mixedDurationStrategy" "MixedDurationPricingStrategy" NOT NULL DEFAULT 'DAILY_ONLY',
    "rentalMonthDefinition" "RentalMonthDefinition" NOT NULL DEFAULT 'FIXED_30_DAYS',
    "billableDayMethod" "BillableDayMethod" NOT NULL DEFAULT 'STARTED_24_HOUR_PERIODS',
    "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 0,
    "minimumRentalMinutes" INTEGER NOT NULL DEFAULT 1,
    "minimumChargeDays" INTEGER NOT NULL DEFAULT 1,
    "priceTaxTreatment" "PriceTaxTreatment" NOT NULL DEFAULT 'TAX_EXCLUDED',
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PricingBillingConfigVersion_pkey" PRIMARY KEY ("configurationVersionId")
);


-- CreateTable
CREATE TABLE "InsuranceConfigVersion" (
    "configurationVersionId" TEXT NOT NULL,
    "requirementMode" "InsuranceRequirementMode" NOT NULL DEFAULT 'DISABLED',
    "pricePerDay" INTEGER NOT NULL DEFAULT 0,
    "taxTreatment" "InsuranceTaxTreatment" NOT NULL DEFAULT 'INHERIT_RENTAL',
    "availabilityScope" "InsuranceAvailabilityScope" NOT NULL DEFAULT 'ALL_VEHICLES',
    "showInConfirmation" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InsuranceConfigVersion_pkey" PRIMARY KEY ("configurationVersionId")
);


-- CreateTable
CREATE TABLE "InsuranceConfigTranslation" (
    "id" TEXT NOT NULL,
    "insuranceConfigVersionId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "customerFacingName" TEXT NOT NULL,
    "shortDescription" TEXT,

    CONSTRAINT "InsuranceConfigTranslation_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "InsuranceVehicleAvailability" (
    "insuranceConfigVersionId" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InsuranceVehicleAvailability_pkey" PRIMARY KEY ("insuranceConfigVersionId","carId")
);


-- CreateTable
CREATE TABLE "CustomerDriverConfigVersion" (
    "configurationVersionId" TEXT NOT NULL,
    "minimumDriverAge" INTEGER NOT NULL DEFAULT 18,
    "maximumDriverAge" INTEGER,
    "minimumLicenceHeldMonths" INTEGER NOT NULL DEFAULT 0,
    "licenceMustCoverRentalEnd" BOOLEAN NOT NULL DEFAULT true,
    "allowedLicenceCountries" TEXT[],

    CONSTRAINT "CustomerDriverConfigVersion_pkey" PRIMARY KEY ("configurationVersionId")
);


-- CreateTable
CREATE TABLE "CustomerFieldRule" (
    "customerDriverConfigVersionId" TEXT NOT NULL,
    "field" "CustomerFieldType" NOT NULL,
    "mode" "CustomerFieldMode" NOT NULL,

    CONSTRAINT "CustomerFieldRule_pkey" PRIMARY KEY ("customerDriverConfigVersionId","field")
);


-- CreateTable
CREATE TABLE "BookingWorkflowConfigVersion" (
    "configurationVersionId" TEXT NOT NULL,

    CONSTRAINT "BookingWorkflowConfigVersion_pkey" PRIMARY KEY ("configurationVersionId")
);


-- CreateTable
CREATE TABLE "BookingStepRule" (
    "bookingWorkflowConfigVersionId" TEXT NOT NULL,
    "step" "BookingStepType" NOT NULL,
    "mode" "BookingStepMode" NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "BookingStepRule_pkey" PRIMARY KEY ("bookingWorkflowConfigVersionId","step")
);


-- CreateTable
CREATE TABLE "DocumentPolicyConfigVersion" (
    "configurationVersionId" TEXT NOT NULL,
    "retentionPreferenceDays" INTEGER NOT NULL,

    CONSTRAINT "DocumentPolicyConfigVersion_pkey" PRIMARY KEY ("configurationVersionId")
);


-- CreateTable
CREATE TABLE "DocumentRequirementRule" (
    "documentPolicyConfigVersionId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "mode" "DocumentRequirementMode" NOT NULL,
    "fileCount" INTEGER NOT NULL,
    "sides" "DocumentSides" NOT NULL,
    "uploadStage" "DocumentUploadStage" NOT NULL,

    CONSTRAINT "DocumentRequirementRule_pkey" PRIMARY KEY ("documentPolicyConfigVersionId","documentTypeId")
);


-- CreateTable
CREATE TABLE "DocumentPolicyRolePermission" (
    "documentPolicyConfigVersionId" TEXT NOT NULL,
    "accessRoleId" TEXT NOT NULL,
    "mayView" BOOLEAN NOT NULL DEFAULT false,
    "mayDownload" BOOLEAN NOT NULL DEFAULT false,
    "mayDelete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DocumentPolicyRolePermission_pkey" PRIMARY KEY ("documentPolicyConfigVersionId","accessRoleId")
);


-- CreateTable
CREATE TABLE "PaymentConfigVersion" (
    "configurationVersionId" TEXT NOT NULL,
    "defaultMethod" "ConfiguredPaymentMode" NOT NULL,
    "confirmationMode" "PaymentConfirmationMode" NOT NULL,
    "depositType" "DepositType" NOT NULL DEFAULT 'NONE',
    "depositValue" INTEGER NOT NULL DEFAULT 0,
    "remainingBalanceRule" "RemainingBalanceRule" NOT NULL DEFAULT 'NOT_APPLICABLE',

    CONSTRAINT "PaymentConfigVersion_pkey" PRIMARY KEY ("configurationVersionId")
);


-- CreateTable
CREATE TABLE "PaymentMethodRule" (
    "paymentConfigVersionId" TEXT NOT NULL,
    "method" "ConfiguredPaymentMode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PaymentMethodRule_pkey" PRIMARY KEY ("paymentConfigVersionId","method")
);


-- CreateTable
CREATE TABLE "PaymentInstructionTranslation" (
    "id" TEXT NOT NULL,
    "paymentConfigVersionId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "instructions" TEXT NOT NULL,

    CONSTRAINT "PaymentInstructionTranslation_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "ConfirmationConfigVersion" (
    "configurationVersionId" TEXT NOT NULL,

    CONSTRAINT "ConfirmationConfigVersion_pkey" PRIMARY KEY ("configurationVersionId")
);


-- CreateTable
CREATE TABLE "ConfirmationSectionRule" (
    "confirmationConfigVersionId" TEXT NOT NULL,
    "sectionDefinitionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConfirmationSectionRule_pkey" PRIMARY KEY ("confirmationConfigVersionId","sectionDefinitionId")
);


-- CreateTable
CREATE TABLE "ConfirmationContentTranslation" (
    "id" TEXT NOT NULL,
    "confirmationConfigVersionId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "heading" TEXT,
    "safeContent" TEXT,

    CONSTRAINT "ConfirmationContentTranslation_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "LegalAcceptanceConfigVersion" (
    "configurationVersionId" TEXT NOT NULL,
    "termsDocumentVersionId" TEXT NOT NULL,
    "privacyDocumentVersionId" TEXT NOT NULL,
    "termsAcceptance" "LegalAcceptanceRequirement" NOT NULL DEFAULT 'REQUIRED',
    "privacyAcknowledgment" "LegalAcceptanceRequirement" NOT NULL DEFAULT 'REQUIRED',
    "retainContentSnapshot" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LegalAcceptanceConfigVersion_pkey" PRIMARY KEY ("configurationVersionId")
);


-- CreateTable
CREATE TABLE "BusinessConfigurationRelease" (
    "id" TEXT NOT NULL,
    "releaseNumber" INTEGER NOT NULL,
    "status" "BusinessConfigurationReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "validationStatus" "ConfigurationValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "validationSnapshot" JSONB,
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
    "supersedesReleaseId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "validatedById" TEXT,
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "BusinessConfigurationRelease_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "FleetRateSet" (
    "id" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ConfigurationVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "validationStatus" "ConfigurationValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "currency" VARCHAR(3) NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "validationSnapshot" JSONB,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "validatedById" TEXT,
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "FleetRateSet_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "VehicleRentalRate" (
    "id" TEXT NOT NULL,
    "fleetRateSetId" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "dailyRate" INTEGER NOT NULL,
    "weeklyRate" INTEGER,
    "monthlyRate" INTEGER,
    "weeklyRateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "monthlyRateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleRentalRate_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE INDEX "ConfigurationVersion_domain_status_idx" ON "ConfigurationVersion"("domain", "status");


-- CreateIndex
CREATE INDEX "ConfigurationVersion_validationStatus_idx" ON "ConfigurationVersion"("validationStatus");


-- CreateIndex
CREATE INDEX "ConfigurationVersion_createdById_createdAt_idx" ON "ConfigurationVersion"("createdById", "createdAt");


-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationVersion_domain_versionNumber_key" ON "ConfigurationVersion"("domain", "versionNumber");


-- CreateIndex
CREATE UNIQUE INDEX "DocumentTypeDefinition_key_key" ON "DocumentTypeDefinition"("key");


-- CreateIndex
CREATE INDEX "DocumentTypeDefinition_isActive_idx" ON "DocumentTypeDefinition"("isActive");


-- CreateIndex
CREATE UNIQUE INDEX "ConfirmationSectionDefinition_key_key" ON "ConfirmationSectionDefinition"("key");


-- CreateIndex
CREATE INDEX "ConfirmationSectionDefinition_isActive_idx" ON "ConfirmationSectionDefinition"("isActive");


-- CreateIndex
CREATE INDEX "InsuranceConfigTranslation_locale_idx" ON "InsuranceConfigTranslation"("locale");


-- CreateIndex
CREATE UNIQUE INDEX "InsuranceConfigTranslation_insuranceConfigVersionId_locale_key" ON "InsuranceConfigTranslation"("insuranceConfigVersionId", "locale");


-- CreateIndex
CREATE INDEX "InsuranceVehicleAvailability_carId_idx" ON "InsuranceVehicleAvailability"("carId");


-- CreateIndex
CREATE INDEX "CustomerFieldRule_field_mode_idx" ON "CustomerFieldRule"("field", "mode");


-- CreateIndex
CREATE INDEX "BookingStepRule_step_mode_idx" ON "BookingStepRule"("step", "mode");


-- CreateIndex
CREATE UNIQUE INDEX "BookingStepRule_bookingWorkflowConfigVersionId_displayOrder_key" ON "BookingStepRule"("bookingWorkflowConfigVersionId", "displayOrder");


-- CreateIndex
CREATE INDEX "DocumentRequirementRule_documentTypeId_mode_idx" ON "DocumentRequirementRule"("documentTypeId", "mode");


-- CreateIndex
CREATE INDEX "DocumentPolicyRolePermission_accessRoleId_idx" ON "DocumentPolicyRolePermission"("accessRoleId");


-- CreateIndex
CREATE INDEX "PaymentMethodRule_method_enabled_idx" ON "PaymentMethodRule"("method", "enabled");


-- CreateIndex
CREATE INDEX "PaymentInstructionTranslation_locale_idx" ON "PaymentInstructionTranslation"("locale");


-- CreateIndex
CREATE UNIQUE INDEX "PaymentInstructionTranslation_paymentConfigVersionId_locale_key" ON "PaymentInstructionTranslation"("paymentConfigVersionId", "locale");


-- CreateIndex
CREATE INDEX "ConfirmationSectionRule_sectionDefinitionId_enabled_idx" ON "ConfirmationSectionRule"("sectionDefinitionId", "enabled");


-- CreateIndex
CREATE INDEX "ConfirmationContentTranslation_locale_idx" ON "ConfirmationContentTranslation"("locale");


-- CreateIndex
CREATE UNIQUE INDEX "ConfirmationContentTranslation_confirmationConfigVersionId__key" ON "ConfirmationContentTranslation"("confirmationConfigVersionId", "locale");


-- CreateIndex
CREATE INDEX "LegalAcceptanceConfigVersion_termsDocumentVersionId_idx" ON "LegalAcceptanceConfigVersion"("termsDocumentVersionId");


-- CreateIndex
CREATE INDEX "LegalAcceptanceConfigVersion_privacyDocumentVersionId_idx" ON "LegalAcceptanceConfigVersion"("privacyDocumentVersionId");


-- CreateIndex
CREATE UNIQUE INDEX "BusinessConfigurationRelease_releaseNumber_key" ON "BusinessConfigurationRelease"("releaseNumber");


-- CreateIndex
CREATE INDEX "BusinessConfigurationRelease_status_idx" ON "BusinessConfigurationRelease"("status");


-- CreateIndex
CREATE INDEX "BusinessConfigurationRelease_validationStatus_idx" ON "BusinessConfigurationRelease"("validationStatus");


-- CreateIndex
CREATE INDEX "BusinessConfigurationRelease_activatedAt_idx" ON "BusinessConfigurationRelease"("activatedAt");


-- CreateIndex
CREATE INDEX "BusinessConfigurationRelease_supersedesReleaseId_idx" ON "BusinessConfigurationRelease"("supersedesReleaseId");


-- CreateIndex
CREATE UNIQUE INDEX "FleetRateSet_versionNumber_key" ON "FleetRateSet"("versionNumber");


-- CreateIndex
CREATE INDEX "FleetRateSet_status_validationStatus_idx" ON "FleetRateSet"("status", "validationStatus");


-- CreateIndex
CREATE INDEX "FleetRateSet_createdById_createdAt_idx" ON "FleetRateSet"("createdById", "createdAt");


-- CreateIndex
CREATE INDEX "VehicleRentalRate_carId_idx" ON "VehicleRentalRate"("carId");


-- CreateIndex
CREATE UNIQUE INDEX "VehicleRentalRate_fleetRateSetId_carId_key" ON "VehicleRentalRate"("fleetRateSetId", "carId");


-- AddForeignKey
ALTER TABLE "ConfigurationVersion" ADD CONSTRAINT "ConfigurationVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ConfigurationVersion" ADD CONSTRAINT "ConfigurationVersion_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ConfigurationVersion" ADD CONSTRAINT "ConfigurationVersion_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "GeneralRentalConfigVersion" ADD CONSTRAINT "GeneralRentalConfigVersion_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "ConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "PricingBillingConfigVersion" ADD CONSTRAINT "PricingBillingConfigVersion_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "ConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "InsuranceConfigVersion" ADD CONSTRAINT "InsuranceConfigVersion_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "ConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "InsuranceConfigTranslation" ADD CONSTRAINT "InsuranceConfigTranslation_insuranceConfigVersionId_fkey" FOREIGN KEY ("insuranceConfigVersionId") REFERENCES "InsuranceConfigVersion"("configurationVersionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "InsuranceVehicleAvailability" ADD CONSTRAINT "InsuranceVehicleAvailability_insuranceConfigVersionId_fkey" FOREIGN KEY ("insuranceConfigVersionId") REFERENCES "InsuranceConfigVersion"("configurationVersionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "InsuranceVehicleAvailability" ADD CONSTRAINT "InsuranceVehicleAvailability_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "CustomerDriverConfigVersion" ADD CONSTRAINT "CustomerDriverConfigVersion_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "ConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "CustomerFieldRule" ADD CONSTRAINT "CustomerFieldRule_customerDriverConfigVersionId_fkey" FOREIGN KEY ("customerDriverConfigVersionId") REFERENCES "CustomerDriverConfigVersion"("configurationVersionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingWorkflowConfigVersion" ADD CONSTRAINT "BookingWorkflowConfigVersion_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "ConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BookingStepRule" ADD CONSTRAINT "BookingStepRule_bookingWorkflowConfigVersionId_fkey" FOREIGN KEY ("bookingWorkflowConfigVersionId") REFERENCES "BookingWorkflowConfigVersion"("configurationVersionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "DocumentPolicyConfigVersion" ADD CONSTRAINT "DocumentPolicyConfigVersion_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "ConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "DocumentRequirementRule" ADD CONSTRAINT "DocumentRequirementRule_documentPolicyConfigVersionId_fkey" FOREIGN KEY ("documentPolicyConfigVersionId") REFERENCES "DocumentPolicyConfigVersion"("configurationVersionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "DocumentRequirementRule" ADD CONSTRAINT "DocumentRequirementRule_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentTypeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "DocumentPolicyRolePermission" ADD CONSTRAINT "DocumentPolicyRolePermission_documentPolicyConfigVersionId_fkey" FOREIGN KEY ("documentPolicyConfigVersionId") REFERENCES "DocumentPolicyConfigVersion"("configurationVersionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "DocumentPolicyRolePermission" ADD CONSTRAINT "DocumentPolicyRolePermission_accessRoleId_fkey" FOREIGN KEY ("accessRoleId") REFERENCES "AccessRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "PaymentConfigVersion" ADD CONSTRAINT "PaymentConfigVersion_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "ConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "PaymentMethodRule" ADD CONSTRAINT "PaymentMethodRule_paymentConfigVersionId_fkey" FOREIGN KEY ("paymentConfigVersionId") REFERENCES "PaymentConfigVersion"("configurationVersionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "PaymentInstructionTranslation" ADD CONSTRAINT "PaymentInstructionTranslation_paymentConfigVersionId_fkey" FOREIGN KEY ("paymentConfigVersionId") REFERENCES "PaymentConfigVersion"("configurationVersionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ConfirmationConfigVersion" ADD CONSTRAINT "ConfirmationConfigVersion_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "ConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ConfirmationSectionRule" ADD CONSTRAINT "ConfirmationSectionRule_confirmationConfigVersionId_fkey" FOREIGN KEY ("confirmationConfigVersionId") REFERENCES "ConfirmationConfigVersion"("configurationVersionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ConfirmationSectionRule" ADD CONSTRAINT "ConfirmationSectionRule_sectionDefinitionId_fkey" FOREIGN KEY ("sectionDefinitionId") REFERENCES "ConfirmationSectionDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ConfirmationContentTranslation" ADD CONSTRAINT "ConfirmationContentTranslation_confirmationConfigVersionId_fkey" FOREIGN KEY ("confirmationConfigVersionId") REFERENCES "ConfirmationConfigVersion"("configurationVersionId") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "LegalAcceptanceConfigVersion" ADD CONSTRAINT "LegalAcceptanceConfigVersion_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "ConfigurationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "LegalAcceptanceConfigVersion" ADD CONSTRAINT "LegalAcceptanceConfigVersion_termsDocumentVersionId_fkey" FOREIGN KEY ("termsDocumentVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "LegalAcceptanceConfigVersion" ADD CONSTRAINT "LegalAcceptanceConfigVersion_privacyDocumentVersionId_fkey" FOREIGN KEY ("privacyDocumentVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_generalRentalConfigVersionId_fkey" FOREIGN KEY ("generalRentalConfigVersionId") REFERENCES "GeneralRentalConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_pricingBillingConfigVersionId_fkey" FOREIGN KEY ("pricingBillingConfigVersionId") REFERENCES "PricingBillingConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_fleetRateSetId_fkey" FOREIGN KEY ("fleetRateSetId") REFERENCES "FleetRateSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_insuranceConfigVersionId_fkey" FOREIGN KEY ("insuranceConfigVersionId") REFERENCES "InsuranceConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_customerDriverConfigVersionId_fkey" FOREIGN KEY ("customerDriverConfigVersionId") REFERENCES "CustomerDriverConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_bookingWorkflowConfigVersionI_fkey" FOREIGN KEY ("bookingWorkflowConfigVersionId") REFERENCES "BookingWorkflowConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_documentPolicyConfigVersionId_fkey" FOREIGN KEY ("documentPolicyConfigVersionId") REFERENCES "DocumentPolicyConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_paymentConfigVersionId_fkey" FOREIGN KEY ("paymentConfigVersionId") REFERENCES "PaymentConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_confirmationConfigVersionId_fkey" FOREIGN KEY ("confirmationConfigVersionId") REFERENCES "ConfirmationConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_legalAcceptanceConfigVersionI_fkey" FOREIGN KEY ("legalAcceptanceConfigVersionId") REFERENCES "LegalAcceptanceConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_supersedesReleaseId_fkey" FOREIGN KEY ("supersedesReleaseId") REFERENCES "BusinessConfigurationRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusinessConfigurationRelease" ADD CONSTRAINT "BusinessConfigurationRelease_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "FleetRateSet" ADD CONSTRAINT "FleetRateSet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "FleetRateSet" ADD CONSTRAINT "FleetRateSet_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "FleetRateSet" ADD CONSTRAINT "FleetRateSet_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "FleetRateSet" ADD CONSTRAINT "FleetRateSet_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "VehicleRentalRate" ADD CONSTRAINT "VehicleRentalRate_fleetRateSetId_fkey" FOREIGN KEY ("fleetRateSetId") REFERENCES "FleetRateSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "VehicleRentalRate" ADD CONSTRAINT "VehicleRentalRate_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
