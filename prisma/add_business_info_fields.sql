-- Safe migration: Add business information fields to CompanySettings
-- These are all optional fields, so safe to add to existing data

-- Add new columns if they don't exist
ALTER TABLE "CompanySettings" 
ADD COLUMN IF NOT EXISTS "managingDirector" TEXT,
ADD COLUMN IF NOT EXISTS "commercialRegister" TEXT,
ADD COLUMN IF NOT EXISTS "registerCourt" TEXT,
ADD COLUMN IF NOT EXISTS "vatId" TEXT,
ADD COLUMN IF NOT EXISTS "responsiblePerson" TEXT;

-- Set default values for existing records (only if they're NULL)
UPDATE "CompanySettings" 
SET 
  "managingDirector" = COALESCE("managingDirector", 'Max Mustermann'),
  "commercialRegister" = COALESCE("commercialRegister", 'HRB 123456 B'),
  "registerCourt" = COALESCE("registerCourt", 'Amtsgericht Berlin-Charlottenburg'),
  "vatId" = COALESCE("vatId", 'DE123456789'),
  "responsiblePerson" = COALESCE("responsiblePerson", 'Max Mustermann, Musterstraße 123, 10115 Berlin, Deutschland')
WHERE id = 'company-settings' AND (
  "managingDirector" IS NULL OR 
  "commercialRegister" IS NULL OR 
  "registerCourt" IS NULL OR 
  "vatId" IS NULL OR 
  "responsiblePerson" IS NULL
);

