-- Add refundable guarantee/security hold configuration and booking snapshot amount
ALTER TABLE "CompanySettings"
ADD COLUMN IF NOT EXISTS "guaranteePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0;

ALTER TABLE "Booking"
ADD COLUMN IF NOT EXISTS "guaranteeAmount" INTEGER NOT NULL DEFAULT 0;
