-- Phase 2B migration 1/6: closed enums and authorization persistence.
-- Additive only; the legacy User.role enum and requireAdmin() behavior are unchanged.

-- CreateEnum
CREATE TYPE "ConfigurationDomainType" AS ENUM ('GENERAL_RENTAL', 'PRICING_BILLING', 'INSURANCE', 'CUSTOMER_DRIVER_REQUIREMENTS', 'BOOKING_WORKFLOW', 'DOCUMENT_POLICY', 'PAYMENTS', 'CONFIRMATIONS', 'LEGAL_ACCEPTANCE');


-- CreateEnum
CREATE TYPE "ConfigurationVersionStatus" AS ENUM ('DRAFT', 'VALIDATED', 'RELEASED', 'ARCHIVED');


-- CreateEnum
CREATE TYPE "ConfigurationValidationStatus" AS ENUM ('NOT_VALIDATED', 'VALID', 'WARNING', 'BLOCKED');


-- CreateEnum
CREATE TYPE "BusinessConfigurationReleaseStatus" AS ENUM ('DRAFT', 'VALIDATED', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED');


-- CreateEnum
CREATE TYPE "MixedDurationPricingStrategy" AS ENUM ('DAILY_ONLY', 'LONGEST_BLOCKS_THEN_DAYS', 'LOWEST_VALID_TOTAL');


-- CreateEnum
CREATE TYPE "RentalMonthDefinition" AS ENUM ('FIXED_28_DAYS', 'FIXED_30_DAYS', 'CALENDAR_MONTH');


-- CreateEnum
CREATE TYPE "BillableDayMethod" AS ENUM ('STARTED_24_HOUR_PERIODS', 'CALENDAR_DAYS', 'PICKUP_TIME_BOUNDARY');


-- CreateEnum
CREATE TYPE "PriceTaxTreatment" AS ENUM ('TAX_INCLUDED', 'TAX_EXCLUDED');


-- CreateEnum
CREATE TYPE "InsuranceRequirementMode" AS ENUM ('DISABLED', 'OPTIONAL', 'MANDATORY');


-- CreateEnum
CREATE TYPE "InsuranceTaxTreatment" AS ENUM ('INHERIT_RENTAL', 'TAX_INCLUDED', 'TAX_EXCLUDED');


-- CreateEnum
CREATE TYPE "InsuranceAvailabilityScope" AS ENUM ('ALL_VEHICLES', 'SELECTED_VEHICLES');


-- CreateEnum
CREATE TYPE "CustomerFieldType" AS ENUM ('FIRST_NAME', 'LAST_NAME', 'EMAIL', 'PHONE', 'DATE_OF_BIRTH', 'COUNTRY', 'ADDRESS', 'CITY', 'POSTAL_CODE', 'NATIONALITY', 'LICENCE_NUMBER', 'LICENCE_ISSUE_DATE', 'LICENCE_EXPIRY_DATE', 'LICENCE_ISSUING_COUNTRY');


-- CreateEnum
CREATE TYPE "CustomerFieldMode" AS ENUM ('REQUIRED', 'OPTIONAL', 'DISABLED');


-- CreateEnum
CREATE TYPE "BookingStepType" AS ENUM ('VEHICLE_AND_DATES', 'CUSTOMER_INFORMATION', 'DRIVER_INFORMATION', 'INSURANCE', 'DOCUMENTS', 'LEGAL_ACCEPTANCE', 'PAYMENT', 'REVIEW', 'CONFIRMATION');


-- CreateEnum
CREATE TYPE "BookingStepMode" AS ENUM ('REQUIRED', 'OPTIONAL', 'HIDDEN');


-- CreateEnum
CREATE TYPE "DocumentRequirementMode" AS ENUM ('REQUIRED', 'OPTIONAL', 'DISABLED');


-- CreateEnum
CREATE TYPE "DocumentSides" AS ENUM ('SINGLE_FILE', 'FRONT_AND_BACK');


-- CreateEnum
CREATE TYPE "DocumentSide" AS ENUM ('SINGLE', 'FRONT', 'BACK');


-- CreateEnum
CREATE TYPE "DocumentUploadStage" AS ENUM ('DURING_BOOKING', 'AFTER_REQUEST', 'BEFORE_PICKUP');


-- CreateEnum
CREATE TYPE "CustomerDocumentUploadStatus" AS ENUM ('PENDING', 'UPLOADING', 'UPLOADED', 'VERIFYING', 'READY', 'REJECTED', 'FAILED');


-- CreateEnum
CREATE TYPE "MalwareScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED', 'NOT_AVAILABLE');


-- CreateEnum
CREATE TYPE "DocumentDeletionStatus" AS ENUM ('RETAINED', 'SCHEDULED', 'DELETED', 'FAILED');


-- CreateEnum
CREATE TYPE "ConfiguredPaymentMode" AS ENUM ('BOOKING_REQUEST', 'CASH_ON_PICKUP', 'CARD_ON_PICKUP', 'BANK_TRANSFER', 'ONLINE_DEPOSIT', 'ONLINE_FULL');


-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('NONE', 'FIXED_AMOUNT', 'PERCENTAGE_BPS');


-- CreateEnum
CREATE TYPE "PaymentConfirmationMode" AS ENUM ('IMMEDIATE', 'REQUIRES_REVIEW');


-- CreateEnum
CREATE TYPE "RemainingBalanceRule" AS ENUM ('NOT_APPLICABLE', 'ON_PICKUP', 'BEFORE_PICKUP');


-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('RENTAL_TERMS', 'PRIVACY_NOTICE');


-- CreateEnum
CREATE TYPE "LegalPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');


-- CreateEnum
CREATE TYPE "LegalAcceptanceRequirement" AS ENUM ('REQUIRED', 'DISPLAY_ONLY');


-- CreateEnum
CREATE TYPE "LegalAcceptanceSource" AS ENUM ('CUSTOMER_CHECKBOX', 'CUSTOMER_SUBMISSION', 'STAFF_RECORDED');


-- CreateEnum
CREATE TYPE "AccessRoleStatus" AS ENUM ('ACTIVE', 'INACTIVE');


-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('CONFIGURATION', 'PRICING', 'INSURANCE', 'LEGAL', 'DOCUMENT', 'PAYMENT', 'AUTHORIZATION', 'BOOKING', 'SYSTEM');


-- CreateTable
CREATE TABLE "AccessRole" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AccessRoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRole_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "Capability" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "RoleCapability" (
    "accessRoleId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleCapability_pkey" PRIMARY KEY ("accessRoleId","capabilityId")
);


-- CreateTable
CREATE TABLE "UserAccessRole" (
    "userId" TEXT NOT NULL,
    "accessRoleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccessRole_pkey" PRIMARY KEY ("userId","accessRoleId")
);


-- CreateIndex
CREATE UNIQUE INDEX "AccessRole_key_key" ON "AccessRole"("key");


-- CreateIndex
CREATE INDEX "AccessRole_status_idx" ON "AccessRole"("status");


-- CreateIndex
CREATE UNIQUE INDEX "Capability_key_key" ON "Capability"("key");


-- CreateIndex
CREATE INDEX "RoleCapability_capabilityId_idx" ON "RoleCapability"("capabilityId");


-- CreateIndex
CREATE INDEX "UserAccessRole_accessRoleId_idx" ON "UserAccessRole"("accessRoleId");


-- AddForeignKey
ALTER TABLE "RoleCapability" ADD CONSTRAINT "RoleCapability_accessRoleId_fkey" FOREIGN KEY ("accessRoleId") REFERENCES "AccessRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "RoleCapability" ADD CONSTRAINT "RoleCapability_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "UserAccessRole" ADD CONSTRAINT "UserAccessRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "UserAccessRole" ADD CONSTRAINT "UserAccessRole_accessRoleId_fkey" FOREIGN KEY ("accessRoleId") REFERENCES "AccessRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
