-- AlterTable: Update CompanySettings defaults
ALTER TABLE "CompanySettings" 
  ALTER COLUMN "companyName" SET DEFAULT 'RentCar GmbH',
  ALTER COLUMN "companyEmail" SET DEFAULT 'info@rentcar.de',
  ALTER COLUMN "companyPhone" SET DEFAULT '+49 (0) 30 12345678',
  ALTER COLUMN "companyAddress" SET DEFAULT 'Musterstraße 123',
  ALTER COLUMN "companyCity" SET DEFAULT '10115 Berlin',
  ALTER COLUMN "companyCountry" SET DEFAULT 'Deutschland',
  ALTER COLUMN "managingDirector" SET DEFAULT 'Max Mustermann',
  ALTER COLUMN "commercialRegister" SET DEFAULT 'HRB 123456 B',
  ALTER COLUMN "registerCourt" SET DEFAULT 'Amtsgericht Berlin-Charlottenburg',
  ALTER COLUMN "vatId" SET DEFAULT 'DE123456789',
  ALTER COLUMN "responsiblePerson" SET DEFAULT 'Max Mustermann, Musterstraße 123, 10115 Berlin, Deutschland';

-- AlterTable: Update User table for NextAuth
-- First drop indexes and constraints on clerkId
DROP INDEX IF EXISTS "User_clerkId_idx";
DROP INDEX IF EXISTS "User_clerkId_key";

-- Drop clerkId column and add NextAuth fields
ALTER TABLE "User" 
  DROP COLUMN IF EXISTS "clerkId",
  ADD COLUMN "emailVerified" TIMESTAMP(3),
  ADD COLUMN "image" TEXT,
  ADD COLUMN "providerId" TEXT;

-- Create indexes for providerId
CREATE INDEX IF NOT EXISTS "User_providerId_idx" ON "User"("providerId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_providerId_key" ON "User"("providerId") WHERE "providerId" IS NOT NULL;

-- Drop test table if it exists
DROP TABLE IF EXISTS "playing_with_neon";

-- CreateTable: Account (NextAuth)
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Session (NextAuth)
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VerificationToken (NextAuth)
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex: Account indexes
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex: Session indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

-- CreateIndex: VerificationToken indexes
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey: Account -> User
ALTER TABLE "Account" 
  ADD CONSTRAINT "Account_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Session -> User
ALTER TABLE "Session" 
  ADD CONSTRAINT "Session_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

