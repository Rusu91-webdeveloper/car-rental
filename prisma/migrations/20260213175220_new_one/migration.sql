/*
  Warnings:

  - A unique constraint covering the columns `[providerId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- Rebuild index to align with Prisma's expected definition
DROP INDEX IF EXISTS "User_providerId_key";
CREATE UNIQUE INDEX "User_providerId_key" ON "User"("providerId");
