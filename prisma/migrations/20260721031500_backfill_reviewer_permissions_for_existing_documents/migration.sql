-- Older document-policy snapshots could require manual review while containing
-- no policy-role rows at all. Backfill only those uninitialized snapshots that
-- already own retained customer documents. Access still requires an explicitly
-- assigned restricted DOCUMENT_* role and the matching capability.
-- The payload guard is suspended only for this table and only inside Prisma's
-- migration transaction. PostgreSQL rolls the trigger state back as well if
-- any statement fails, and the guard is explicitly re-enabled before commit.
ALTER TABLE "DocumentPolicyRolePermission"
  DISABLE TRIGGER "DocumentPolicyRolePermission_immutable";

WITH policies_requiring_access AS (
  SELECT DISTINCT document."documentPolicyConfigVersionId" AS policy_id
  FROM "CustomerDocument" document
  WHERE document."documentPolicyConfigVersionId" IS NOT NULL
    AND document."deletionStatus" <> 'DELETED'
    AND NOT EXISTS (
      SELECT 1
      FROM "DocumentPolicyRolePermission" existing
      WHERE existing."documentPolicyConfigVersionId" = document."documentPolicyConfigVersionId"
    )
)
INSERT INTO "DocumentPolicyRolePermission" (
  "documentPolicyConfigVersionId",
  "accessRoleId",
  "mayView",
  "mayDownload",
  "mayDelete",
  "mayManageLegalHold"
)
SELECT
  policy.policy_id,
  role.id,
  role.key IN ('DOCUMENT_REVIEWER', 'DOCUMENT_DOWNLOADER'),
  role.key = 'DOCUMENT_DOWNLOADER',
  role.key = 'DOCUMENT_RETENTION_OPERATOR',
  role.key = 'DOCUMENT_SECURITY_ADMIN'
FROM policies_requiring_access policy
JOIN "AccessRole" role
  ON role.key IN (
    'DOCUMENT_REVIEWER',
    'DOCUMENT_DOWNLOADER',
    'DOCUMENT_RETENTION_OPERATOR',
    'DOCUMENT_SECURITY_ADMIN'
  )
 AND role.status = 'ACTIVE'
ON CONFLICT ("documentPolicyConfigVersionId", "accessRoleId") DO NOTHING;

ALTER TABLE "DocumentPolicyRolePermission"
  ENABLE TRIGGER "DocumentPolicyRolePermission_immutable";
