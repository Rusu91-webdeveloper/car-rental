ALTER TABLE "DocumentUploadIntent"
  ADD COLUMN "replacesDocumentId" TEXT;

ALTER TABLE "DocumentUploadIntent"
  ADD CONSTRAINT "DocumentUploadIntent_replacesDocumentId_fkey"
  FOREIGN KEY ("replacesDocumentId")
  REFERENCES "CustomerDocument"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "DocumentUploadIntent"
  VALIDATE CONSTRAINT "DocumentUploadIntent_replacesDocumentId_fkey";

CREATE INDEX "DocumentUploadIntent_replacesDocumentId_idx"
  ON "DocumentUploadIntent"("replacesDocumentId");

CREATE OR REPLACE FUNCTION enforce_document_upload_intent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  session_policy text;
  session_status "DocumentUploadSessionStatus";
  rule_sides "DocumentSides";
  rule_count integer;
  prior "CustomerDocument"%ROWTYPE;
BEGIN
  SELECT "documentPolicyConfigVersionId", status INTO session_policy, session_status
  FROM "DocumentUploadSession" WHERE id = NEW."uploadSessionId";
  IF session_policy IS NULL OR session_policy <> NEW."documentPolicyConfigVersionId" OR session_status <> 'OPEN' THEN
    RAISE EXCEPTION 'Document upload intent does not belong to an open session policy';
  END IF;
  SELECT sides, "fileCount" INTO rule_sides, rule_count
  FROM "DocumentRequirementRule"
  WHERE "documentPolicyConfigVersionId" = NEW."documentPolicyConfigVersionId" AND "documentTypeId" = NEW."documentTypeId";
  IF rule_sides IS NULL OR NEW."slotNumber" > rule_count OR
     (rule_sides = 'SINGLE_FILE' AND NEW.side <> 'SINGLE') OR
     (rule_sides = 'FRONT_AND_BACK' AND NEW.side NOT IN ('FRONT', 'BACK')) THEN
    RAISE EXCEPTION 'Document upload intent slot/side is inconsistent with its rule';
  END IF;
  IF NEW."replacesDocumentId" IS NOT NULL THEN
    SELECT * INTO prior
    FROM "CustomerDocument"
    WHERE id = NEW."replacesDocumentId";
    IF prior.id IS NULL OR
       prior."isCurrent" IS NOT TRUE OR
       prior."deletionStatus" = 'DELETED' OR
       prior."uploadSessionId" IS DISTINCT FROM NEW."uploadSessionId" OR
       prior."documentTypeId" IS DISTINCT FROM NEW."documentTypeId" OR
       prior.side IS DISTINCT FROM NEW.side OR
       prior."slotNumber" IS DISTINCT FROM NEW."slotNumber" OR
       prior."attemptNumber" >= NEW."attemptNumber" THEN
      RAISE EXCEPTION 'Document upload intent replacement predecessor is stale or inconsistent';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> NEW.status AND NOT (
      (OLD.status = 'INTENT_CREATED' AND NEW.status IN ('UPLOADING','ABORTED','EXPIRED','FAILED')) OR
      (OLD.status = 'UPLOADING' AND NEW.status IN ('UPLOADED','ABORTED','EXPIRED','FAILED')) OR
      (OLD.status = 'UPLOADED' AND NEW.status IN ('VERIFYING','REJECTED','FAILED','EXPIRED')) OR
      (OLD.status = 'VERIFYING' AND NEW.status IN ('QUARANTINED','REJECTED','FAILED')) OR
      (OLD.status = 'QUARANTINED' AND NEW.status::text IN ('TECHNICALLY_VALID','SCAN_PENDING','REJECTED','FAILED')) OR
      (OLD.status = 'SCAN_PENDING' AND NEW.status IN ('CLEAN','REJECTED','FAILED'))
    ) THEN
      RAISE EXCEPTION 'Invalid document upload intent transition % -> %', OLD.status, NEW.status;
    END IF;
    IF OLD.status <> NEW.status AND NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'Document upload intent transition requires the next revision';
    END IF;
    IF OLD.status::text IN ('TECHNICALLY_VALID','CLEAN','REJECTED','FAILED','ABORTED','EXPIRED') AND to_jsonb(NEW) <> to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Terminal document upload intent % is immutable', OLD.id;
    END IF;
    IF NEW."uploadSessionId" <> OLD."uploadSessionId" OR NEW."documentPolicyConfigVersionId" <> OLD."documentPolicyConfigVersionId" OR
       NEW."documentTypeId" <> OLD."documentTypeId" OR NEW.side <> OLD.side OR NEW."slotNumber" <> OLD."slotNumber" OR
       NEW."attemptNumber" <> OLD."attemptNumber" OR NEW."storageProviderId" <> OLD."storageProviderId" OR
       NEW."storageRegion" <> OLD."storageRegion" OR NEW."storageContainerId" <> OLD."storageContainerId" OR
       NEW."storageKey" <> OLD."storageKey" OR
       NEW."replacesDocumentId" IS DISTINCT FROM OLD."replacesDocumentId" THEN
      RAISE EXCEPTION 'Document upload intent binding and object identity are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
