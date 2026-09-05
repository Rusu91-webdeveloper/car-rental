ALTER TABLE "CompanySettings" ALTER COLUMN "companyName" SET DEFAULT 'Qujo Autovermietung GmbH';
ALTER TABLE "CompanySettings" ALTER COLUMN "companyEmail" SET DEFAULT '';
ALTER TABLE "CompanySettings" ALTER COLUMN "companyPhone" DROP DEFAULT;
ALTER TABLE "CompanySettings" ALTER COLUMN "companyAddress" DROP DEFAULT;
ALTER TABLE "CompanySettings" ALTER COLUMN "companyCity" DROP DEFAULT;
ALTER TABLE "CompanySettings" ALTER COLUMN "managingDirector" DROP DEFAULT;
ALTER TABLE "CompanySettings" ALTER COLUMN "commercialRegister" DROP DEFAULT;
ALTER TABLE "CompanySettings" ALTER COLUMN "registerCourt" DROP DEFAULT;
ALTER TABLE "CompanySettings" ALTER COLUMN "vatId" DROP DEFAULT;
ALTER TABLE "CompanySettings" ALTER COLUMN "responsiblePerson" DROP DEFAULT;
ALTER TABLE "CompanySettings" ALTER COLUMN "bankName" SET DEFAULT '';
ALTER TABLE "CompanySettings" ALTER COLUMN "accountName" SET DEFAULT '';
ALTER TABLE "CompanySettings" ALTER COLUMN "accountNumber" SET DEFAULT '';
ALTER TABLE "CompanySettings" ALTER COLUMN "swiftCode" SET DEFAULT '';
ALTER TABLE "CompanySettings" ALTER COLUMN "supportEmail" SET DEFAULT '';
ALTER TABLE "CompanySettings" ALTER COLUMN "adminEmail" SET DEFAULT '';

UPDATE "CompanySettings"
SET
  "companyName" = CASE WHEN "companyName" = 'RentCar GmbH' THEN 'Qujo Autovermietung GmbH' ELSE "companyName" END,
  "companyEmail" = CASE WHEN "companyEmail" = 'info@rentcar.de' THEN '' ELSE "companyEmail" END,
  "companyPhone" = CASE WHEN "companyPhone" = '+49 (0) 30 12345678' THEN NULL ELSE "companyPhone" END,
  "companyAddress" = CASE WHEN "companyAddress" = 'Musterstraße 123' THEN NULL ELSE "companyAddress" END,
  "companyCity" = CASE WHEN "companyCity" = '10115 Berlin' THEN NULL ELSE "companyCity" END,
  "managingDirector" = CASE WHEN "managingDirector" = 'Max Mustermann' THEN NULL ELSE "managingDirector" END,
  "commercialRegister" = CASE WHEN "commercialRegister" = 'HRB 123456 B' THEN NULL ELSE "commercialRegister" END,
  "registerCourt" = CASE WHEN "registerCourt" = 'Amtsgericht Berlin-Charlottenburg' THEN NULL ELSE "registerCourt" END,
  "vatId" = CASE WHEN "vatId" = 'DE123456789' THEN NULL ELSE "vatId" END,
  "responsiblePerson" = CASE WHEN "responsiblePerson" = 'Max Mustermann, Musterstraße 123, 10115 Berlin, Deutschland' THEN NULL ELSE "responsiblePerson" END,
  "bankName" = CASE WHEN "bankName" = 'Your Bank Name' THEN '' ELSE "bankName" END,
  "accountName" = CASE WHEN "accountName" = 'Car Rental Company' THEN '' ELSE "accountName" END,
  "accountNumber" = CASE WHEN "accountNumber" = '1234567890' THEN '' ELSE "accountNumber" END,
  "swiftCode" = CASE WHEN "swiftCode" = 'YOURSWIFT' THEN '' ELSE "swiftCode" END,
  "supportEmail" = CASE WHEN "supportEmail" = 'support@rentcar.com' THEN '' ELSE "supportEmail" END,
  "adminEmail" = CASE WHEN "adminEmail" = 'admin@rentcar.com' THEN '' ELSE "adminEmail" END;
