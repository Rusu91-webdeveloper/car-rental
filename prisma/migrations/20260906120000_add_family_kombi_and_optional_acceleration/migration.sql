-- Additive category expansion; existing enum values and rows are preserved.
ALTER TYPE "CarCategory" ADD VALUE IF NOT EXISTS 'FAMILY_CAR';
ALTER TYPE "CarCategory" ADD VALUE IF NOT EXISTS 'KOMBI';

-- Existing acceleration values are preserved; future cars may omit the field.
ALTER TABLE "Car" ALTER COLUMN "acceleration" DROP NOT NULL;
