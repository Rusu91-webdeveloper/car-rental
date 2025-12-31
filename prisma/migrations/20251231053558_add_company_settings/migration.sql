-- AlterEnum
ALTER TYPE "AdminAction" ADD VALUE 'SETTINGS_UPDATED';

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL DEFAULT 'company-settings',
    "companyName" TEXT NOT NULL DEFAULT 'Car Rental Company',
    "companyEmail" TEXT NOT NULL DEFAULT 'support@rentcar.com',
    "companyPhone" TEXT,
    "companyAddress" TEXT,
    "companyCity" TEXT,
    "companyState" TEXT,
    "companyZipCode" TEXT,
    "companyCountry" TEXT,
    "bankName" TEXT NOT NULL DEFAULT 'Your Bank Name',
    "accountName" TEXT NOT NULL DEFAULT 'Car Rental Company',
    "accountNumber" TEXT NOT NULL DEFAULT '1234567890',
    "swiftCode" TEXT NOT NULL DEFAULT 'YOURSWIFT',
    "iban" TEXT,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "taxIncluded" BOOLEAN NOT NULL DEFAULT false,
    "depositPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "supportEmail" TEXT NOT NULL DEFAULT 'support@rentcar.com',
    "adminEmail" TEXT NOT NULL DEFAULT 'admin@rentcar.com',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "currencySymbol" TEXT NOT NULL DEFAULT '€',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);
