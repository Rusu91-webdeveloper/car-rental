-- Phase 8C migration 5/6: restricted document capability/role vocabulary.
-- No user is assigned. ADMIN_COMPAT receives no new capability.

INSERT INTO "Capability" ("id", "key", "description")
VALUES (
  'capability-documents-legal-hold-manage',
  'documents.legal-hold.manage',
  'Apply and release authorized private-document legal holds.'
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AccessRole" ("id", "key", "name", "description", "status", "isSystem", "updatedAt")
VALUES
  ('access-role-document-reviewer', 'DOCUMENT_REVIEWER', 'Document reviewer', 'May view private documents only when the exact document policy also permits it.', 'ACTIVE', true, CURRENT_TIMESTAMP),
  ('access-role-document-downloader', 'DOCUMENT_DOWNLOADER', 'Document downloader', 'May view and download private documents only when the exact policy permits both.', 'ACTIVE', true, CURRENT_TIMESTAMP),
  ('access-role-document-retention-operator', 'DOCUMENT_RETENTION_OPERATOR', 'Document retention operator', 'May request authorized private-document deletion workflows.', 'ACTIVE', true, CURRENT_TIMESTAMP),
  ('access-role-document-legal-hold-officer', 'DOCUMENT_LEGAL_HOLD_OFFICER', 'Document legal-hold officer', 'May apply and release private-document legal holds when the exact policy permits it.', 'ACTIVE', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RoleCapability" ("accessRoleId", "capabilityId")
SELECT role.id, capability.id
FROM "AccessRole" role
JOIN "Capability" capability ON (
  (role.key = 'DOCUMENT_REVIEWER' AND capability.key = 'documents.view') OR
  (role.key = 'DOCUMENT_DOWNLOADER' AND capability.key IN ('documents.view', 'documents.download')) OR
  (role.key = 'DOCUMENT_RETENTION_OPERATOR' AND capability.key = 'documents.delete') OR
  (role.key = 'DOCUMENT_LEGAL_HOLD_OFFICER' AND capability.key = 'documents.legal-hold.manage')
)
ON CONFLICT ("accessRoleId", "capabilityId") DO NOTHING;

-- Guard against accidental sensitive-role bootstrap in this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "UserAccessRole" assignment
    JOIN "AccessRole" role ON role.id = assignment."accessRoleId"
    WHERE role.key IN (
      'DOCUMENT_REVIEWER', 'DOCUMENT_DOWNLOADER',
      'DOCUMENT_RETENTION_OPERATOR', 'DOCUMENT_LEGAL_HOLD_OFFICER'
    )
  ) THEN
    RAISE EXCEPTION 'Phase 8 restricted document roles must not be assigned automatically';
  END IF;
END;
$$;
