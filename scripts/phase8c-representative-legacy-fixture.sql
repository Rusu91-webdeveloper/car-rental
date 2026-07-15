\set ON_ERROR_STOP on

-- Insert after the Phase 7 migration and before Phase 8C migrations.
-- Synthetic metadata only; no file bytes, identity data, or external provider access.
INSERT INTO "User" (id, email, name, role, "isActive", "createdAt", "updatedAt")
VALUES ('p8-legacy-user', 'legacy@phase8.invalid', 'Synthetic legacy user', 'USER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "CustomerDocument" (
  id, "customerUserId", "uploadedById", "documentTypeId", side, sequence,
  "storageProviderId", "storageRegion", "storageKey", "originalFileName", "normalizedMimeType",
  "detectedMimeType", "detectedFileType", "fileExtension", "sizeBytes", "checksumSha256",
  "uploadStatus", "scanStatus", "retentionUntil", "legalHold", "deletionStatus", "createdAt", "updatedAt"
) VALUES (
  'p8-pre-migration-document', 'p8-legacy-user', 'p8-legacy-user', 'document-type-driving-licence', 'SINGLE', 1,
  'legacy-private', 'legacy-eu', 'opaque-pre-phase8', 'legacy.jpg', 'image/jpeg', NULL, NULL, 'jpg', 128,
  repeat('a', 64), 'PENDING', 'PENDING', CURRENT_TIMESTAMP + interval '1 day', false, 'RETAINED',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
