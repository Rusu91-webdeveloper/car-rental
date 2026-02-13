-- Stabilize migration history by removing providerId uniqueness drift.
-- NextAuth already enforces provider uniqueness via Account(provider, providerAccountId).
DROP INDEX IF EXISTS "User_providerId_key";
CREATE INDEX IF NOT EXISTS "User_providerId_idx" ON "User"("providerId");
