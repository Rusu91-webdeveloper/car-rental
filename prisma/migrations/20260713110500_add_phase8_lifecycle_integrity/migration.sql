-- Phase 8C migration 6/6: checks, partial indexes, lifecycle guards, and append-only evidence.
-- These functions validate persisted facts only and never contact storage/scanner services.

ALTER TABLE "DocumentUploadSession"
  ADD CONSTRAINT "DocumentUploadSession_shape_check" CHECK (
    "revision" > 0 AND "pickupAt" < "returnAt" AND "expiresAt" > "createdAt" AND
    (
      ("status" = 'OPEN' AND "bookingId" IS NULL AND "consumedAt" IS NULL AND "abortedAt" IS NULL) OR
      ("status" = 'CONSUMED' AND "bookingId" IS NOT NULL AND "consumedAt" IS NOT NULL AND "abortedAt" IS NULL) OR
      ("status" = 'EXPIRED' AND "bookingId" IS NULL AND "consumedAt" IS NULL AND "abortedAt" IS NULL) OR
      ("status" = 'ABORTED' AND "bookingId" IS NULL AND "consumedAt" IS NULL AND "abortedAt" IS NOT NULL)
    )
  );

ALTER TABLE "DocumentUploadIntent"
  ADD CONSTRAINT "DocumentUploadIntent_shape_check" CHECK (
    "slotNumber" > 0 AND "attemptNumber" > 0 AND "filePolicyVersion" > 0 AND
    "revision" > 0 AND "expectedSizeBytes" BETWEEN 1 AND 10485760 AND
    "expectedChecksumSha256" ~ '^[0-9a-f]{64}$' AND
    "normalizedExtension" IN ('.pdf', '.jpg', '.jpeg', '.png') AND
    "declaredMimeType" IN ('application/pdf', 'image/jpeg', 'image/png') AND
    "cleanupEligibleAt" >= "expiresAt" AND
    ("failureCode" IS NULL OR "failureCode" ~ '^[A-Z0-9_]{1,64}$') AND
    (
      ("status" IN ('INTENT_CREATED', 'UPLOADING') AND "uploadCompletedAt" IS NULL AND "completedAt" IS NULL AND "abortedAt" IS NULL) OR
      ("status" = 'UPLOADED' AND "uploadCompletedAt" IS NOT NULL AND "completedAt" IS NULL AND "abortedAt" IS NULL) OR
      ("status" IN ('VERIFYING', 'QUARANTINED', 'SCAN_PENDING') AND "uploadCompletedAt" IS NOT NULL AND "verificationStartedAt" IS NOT NULL AND "completedAt" IS NULL AND "abortedAt" IS NULL) OR
      ("status" = 'CLEAN' AND "uploadCompletedAt" IS NOT NULL AND "verificationStartedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "abortedAt" IS NULL AND "failureCode" IS NULL) OR
      ("status" IN ('REJECTED', 'FAILED') AND "completedAt" IS NOT NULL AND "failureCode" IS NOT NULL AND "abortedAt" IS NULL) OR
      ("status" = 'ABORTED' AND "completedAt" IS NULL AND "abortedAt" IS NOT NULL) OR
      ("status" = 'EXPIRED' AND "completedAt" IS NULL AND "abortedAt" IS NULL)
    )
  );

ALTER TABLE "CustomerDocument"
  ADD CONSTRAINT "CustomerDocument_phase8_shape_check" CHECK (
    "evidenceSchemaVersion" > 0 AND "scanAttemptCount" >= 0 AND
    (
      "evidenceSchemaVersion" = 1 OR
      (
        "evidenceSchemaVersion" = 2 AND
        "uploadSessionId" IS NOT NULL AND "uploadIntentId" IS NOT NULL AND
        "configurationReleaseId" IS NOT NULL AND "documentPolicyConfigVersionId" IS NOT NULL AND
        "documentRequirementTypeId" = "documentTypeId" AND
        "slotNumber" > 0 AND "attemptNumber" > 0 AND "sequence" = "attemptNumber" AND
        "storageContainerId" IS NOT NULL AND "declaredMimeType" IS NOT NULL AND
        "filePolicyVersion" > 0 AND "quarantineStatus" IS NOT NULL AND
        "quarantinedAt" IS NOT NULL AND "fileValidatorVersion" IS NOT NULL AND
        "retentionBasis" IS NOT NULL AND "retentionBasisAt" IS NOT NULL AND
        "retentionPolicyDaysSnapshot" BETWEEN 1 AND 365 AND
        "hardRetentionDaysSnapshot" BETWEEN "retentionPolicyDaysSnapshot" AND 365 AND
        "deletionEligibleAt" IS NOT NULL AND "sizeBytes" BETWEEN 1 AND 10485760 AND
        "checksumSha256" ~ '^[0-9a-f]{64}$' AND
        "fileExtension" IN ('.pdf', '.jpg', '.jpeg', '.png') AND
        "declaredMimeType" IN ('application/pdf', 'image/jpeg', 'image/png') AND
        "normalizedMimeType" IN ('application/pdf', 'image/jpeg', 'image/png') AND
        ("verificationFailureCode" IS NULL OR "verificationFailureCode" ~ '^[A-Z0-9_]{1,64}$') AND
        ("scanResultCode" IS NULL OR "scanResultCode" ~ '^[A-Z0-9_]{1,64}$') AND
        (
          "uploadStatus" <> 'READY' OR
          (
            "metadataVerifiedAt" IS NOT NULL AND "verificationFailureCode" IS NULL AND
            "scanStatus" = 'CLEAN' AND "scanAttemptCount" > 0 AND "scanCompletedAt" IS NOT NULL AND
            "quarantineStatus" IN ('RELEASED', 'DELETED') AND "releasedFromQuarantineAt" IS NOT NULL
          )
        ) AND
        ("deletionStatus" <> 'DELETED' OR ("deletedAt" IS NOT NULL AND "isCurrent" = false))
      )
    )
  ) NOT VALID;

ALTER TABLE "DocumentMalwareScanAttempt"
  ADD CONSTRAINT "DocumentMalwareScanAttempt_shape_check" CHECK (
    "attemptNumber" > 0 AND "completedAt" >= "startedAt" AND
    "outcome" NOT IN ('PENDING', 'NOT_AVAILABLE') AND
    ("providerReference" IS NOT NULL OR "providerEventId" IS NOT NULL) AND
    ("safeResultCode" IS NULL OR "safeResultCode" ~ '^[A-Z0-9_]{1,64}$') AND
    ("sanitizedMetadata" IS NULL OR octet_length("sanitizedMetadata"::text) <= 4096)
  );

ALTER TABLE "DocumentLegalHold"
  ADD CONSTRAINT "DocumentLegalHold_shape_check" CHECK (
    "revision" > 0 AND length(btrim("reason")) BETWEEN 1 AND 2000 AND
    ("reviewAt" IS NULL OR "reviewAt" >= "appliedAt") AND
    ("expiresAt" IS NULL OR "expiresAt" >= "appliedAt") AND
    (
      ("releasedById" IS NULL AND "releasedAt" IS NULL AND "releaseReason" IS NULL) OR
      ("releasedById" IS NOT NULL AND "releasedAt" IS NOT NULL AND "releasedAt" >= "appliedAt" AND length(btrim("releaseReason")) BETWEEN 1 AND 2000)
    )
  );

ALTER TABLE "DocumentDeletionRequest"
  ADD CONSTRAINT "DocumentDeletionRequest_shape_check" CHECK (
    "revision" > 0 AND length(btrim("reason")) BETWEEN 1 AND 2000 AND
    "mustCompleteBy" >= "eligibleAt" AND "mustCompleteBy" <= "eligibleAt" + interval '7 days' AND
    ("lastFailureCode" IS NULL OR "lastFailureCode" ~ '^[A-Z0-9_]{1,64}$') AND
    (
      ("status" <> 'COMPLETED' AND "completedAt" IS NULL) OR
      ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "providerConfirmedAt" IS NOT NULL AND "providerConfirmationRef" IS NOT NULL)
    )
  );

ALTER TABLE "DocumentDeletionAttempt"
  ADD CONSTRAINT "DocumentDeletionAttempt_shape_check" CHECK (
    "attemptNumber" > 0 AND "completedAt" >= "startedAt" AND
    ("safeFailureCode" IS NULL OR "safeFailureCode" ~ '^[A-Z0-9_]{1,64}$') AND
    (
      ("outcome" IN ('DELETED', 'ALREADY_MISSING') AND "retryable" = false AND "providerConfirmationRef" IS NOT NULL AND "safeFailureCode" IS NULL) OR
      ("outcome" = 'RETRYABLE_FAILURE' AND "retryable" = true AND "safeFailureCode" IS NOT NULL) OR
      ("outcome" = 'PERMANENT_FAILURE' AND "retryable" = false AND "safeFailureCode" IS NOT NULL)
    )
  );

ALTER TABLE "CustomerDocument" VALIDATE CONSTRAINT "CustomerDocument_phase8_shape_check";

CREATE UNIQUE INDEX "CustomerDocument_phase8_current_slot_key"
  ON "CustomerDocument" ("uploadSessionId", "documentTypeId", "side", "slotNumber")
  WHERE "evidenceSchemaVersion" >= 2 AND "isCurrent" = true AND "deletionStatus" <> 'DELETED';

CREATE UNIQUE INDEX "DocumentLegalHold_one_active_key"
  ON "DocumentLegalHold" ("customerDocumentId") WHERE "releasedAt" IS NULL;

CREATE UNIQUE INDEX "DocumentDeletionRequest_one_open_key"
  ON "DocumentDeletionRequest" ("customerDocumentId") WHERE "status" <> 'COMPLETED';

CREATE INDEX "CustomerDocument_retention_due_idx"
  ON "CustomerDocument" ("deletionEligibleAt", "id")
  WHERE "deletionStatus" IN ('RETAINED', 'FAILED') AND "legalHold" = false;

CREATE INDEX "CustomerDocument_scan_pending_idx"
  ON "CustomerDocument" ("scanRequestedAt", "id")
  WHERE "scanStatus" = 'PENDING' AND "uploadStatus" = 'VERIFYING';

CREATE INDEX "DocumentLegalHold_review_due_idx"
  ON "DocumentLegalHold" ("reviewAt", "id")
  WHERE "releasedAt" IS NULL AND "reviewAt" IS NOT NULL;

CREATE INDEX "DocumentDeletionRequest_work_idx"
  ON "DocumentDeletionRequest" ("eligibleAt", "id")
  WHERE "status" IN ('SCHEDULED', 'FAILED');

-- Existing configuration immutability function also protects the new translation child.
CREATE TRIGGER "DocumentRequirementTranslation_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "DocumentRequirementTranslation"
FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('documentPolicyConfigVersionId');

CREATE OR REPLACE FUNCTION enforce_document_upload_session()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  release_policy text;
  booking_user text;
  booking_car text;
  booking_pickup timestamp(3);
  booking_return timestamp(3);
  booking_release text;
BEGIN
  SELECT "documentPolicyConfigVersionId" INTO release_policy
  FROM "BusinessConfigurationRelease" WHERE id = NEW."configurationReleaseId";
  IF release_policy IS NULL OR release_policy <> NEW."documentPolicyConfigVersionId" THEN
    RAISE EXCEPTION 'Document upload session release/policy provenance is inconsistent';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> NEW.status AND NOT (
      OLD.status = 'OPEN' AND NEW.status IN ('CONSUMED', 'EXPIRED', 'ABORTED')
    ) THEN
      RAISE EXCEPTION 'Invalid document upload session transition % -> %', OLD.status, NEW.status;
    END IF;
    IF OLD.status <> NEW.status AND NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'Document upload session transition requires the next revision';
    END IF;
    IF OLD.status <> 'OPEN' AND to_jsonb(NEW) <> to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Terminal document upload session % is immutable', OLD.id;
    END IF;
    IF NEW."customerUserId" <> OLD."customerUserId" OR NEW."carId" <> OLD."carId" OR
       NEW."configurationReleaseId" <> OLD."configurationReleaseId" OR
       NEW."documentPolicyConfigVersionId" <> OLD."documentPolicyConfigVersionId" OR
       NEW."pickupAt" <> OLD."pickupAt" OR NEW."returnAt" <> OLD."returnAt" THEN
      RAISE EXCEPTION 'Document upload session binding is immutable';
    END IF;
    IF NEW.status = 'EXPIRED' AND CURRENT_TIMESTAMP < NEW."expiresAt" THEN
      RAISE EXCEPTION 'Document upload session cannot expire before expiresAt';
    END IF;
  END IF;

  IF NEW.status = 'CONSUMED' THEN
    IF CURRENT_TIMESTAMP >= NEW."expiresAt" THEN
      RAISE EXCEPTION 'Expired document upload session cannot be consumed';
    END IF;
    SELECT booking."userId", booking."carId", booking."pickupDate", booking."dropoffDate", pricing."configurationReleaseId"
      INTO booking_user, booking_car, booking_pickup, booking_return, booking_release
    FROM "Booking" booking
    JOIN "BookingPricingSnapshot" pricing ON pricing."bookingId" = booking.id
    WHERE booking.id = NEW."bookingId";
    IF booking_user IS NULL OR booking_user <> NEW."customerUserId" OR booking_car <> NEW."carId" OR
       booking_pickup <> NEW."pickupAt" OR booking_return <> NEW."returnAt" OR
       booking_release IS NULL OR booking_release <> NEW."configurationReleaseId" THEN
      RAISE EXCEPTION 'Consumed document upload session does not match Booking evidence';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentUploadSession_lifecycle"
BEFORE INSERT OR UPDATE ON "DocumentUploadSession"
FOR EACH ROW EXECUTE FUNCTION enforce_document_upload_session();

CREATE OR REPLACE FUNCTION enforce_document_upload_intent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  session_policy text;
  session_status "DocumentUploadSessionStatus";
  rule_sides "DocumentSides";
  rule_count integer;
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
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> NEW.status AND NOT (
      (OLD.status = 'INTENT_CREATED' AND NEW.status IN ('UPLOADING','ABORTED','EXPIRED','FAILED')) OR
      (OLD.status = 'UPLOADING' AND NEW.status IN ('UPLOADED','ABORTED','EXPIRED','FAILED')) OR
      (OLD.status = 'UPLOADED' AND NEW.status IN ('VERIFYING','REJECTED','FAILED','EXPIRED')) OR
      (OLD.status = 'VERIFYING' AND NEW.status IN ('QUARANTINED','REJECTED','FAILED')) OR
      (OLD.status = 'QUARANTINED' AND NEW.status IN ('SCAN_PENDING','REJECTED','FAILED')) OR
      (OLD.status = 'SCAN_PENDING' AND NEW.status IN ('CLEAN','REJECTED','FAILED'))
    ) THEN
      RAISE EXCEPTION 'Invalid document upload intent transition % -> %', OLD.status, NEW.status;
    END IF;
    IF OLD.status <> NEW.status AND NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'Document upload intent transition requires the next revision';
    END IF;
    IF OLD.status IN ('CLEAN','REJECTED','FAILED','ABORTED','EXPIRED') AND to_jsonb(NEW) <> to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Terminal document upload intent % is immutable', OLD.id;
    END IF;
    IF NEW."uploadSessionId" <> OLD."uploadSessionId" OR NEW."documentPolicyConfigVersionId" <> OLD."documentPolicyConfigVersionId" OR
       NEW."documentTypeId" <> OLD."documentTypeId" OR NEW.side <> OLD.side OR NEW."slotNumber" <> OLD."slotNumber" OR
       NEW."attemptNumber" <> OLD."attemptNumber" OR NEW."storageProviderId" <> OLD."storageProviderId" OR
       NEW."storageRegion" <> OLD."storageRegion" OR NEW."storageContainerId" <> OLD."storageContainerId" OR
       NEW."storageKey" <> OLD."storageKey" THEN
      RAISE EXCEPTION 'Document upload intent binding and object identity are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentUploadIntent_lifecycle"
BEFORE INSERT OR UPDATE ON "DocumentUploadIntent"
FOR EACH ROW EXECUTE FUNCTION enforce_document_upload_intent();

CREATE OR REPLACE FUNCTION enforce_phase8_customer_document()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  session_customer text;
  session_release text;
  session_policy text;
  intent_session text;
  intent_policy text;
  intent_type text;
  intent_side "DocumentSide";
  intent_slot integer;
  intent_attempt integer;
  intent_status "DocumentUploadIntentStatus";
  release_policy text;
  booking_user text;
  booking_release text;
  prior "CustomerDocument"%ROWTYPE;
  cycle_found boolean;
BEGIN
  IF NEW."evidenceSchemaVersion" = 1 THEN
    RETURN NEW;
  END IF;
  IF NEW."evidenceSchemaVersion" <> 2 THEN
    RAISE EXCEPTION 'Unsupported CustomerDocument evidence schema version %', NEW."evidenceSchemaVersion";
  END IF;

  SELECT "customerUserId", "configurationReleaseId", "documentPolicyConfigVersionId"
    INTO session_customer, session_release, session_policy
  FROM "DocumentUploadSession" WHERE id = NEW."uploadSessionId";
  SELECT "uploadSessionId", "documentPolicyConfigVersionId", "documentTypeId", side, "slotNumber", "attemptNumber", status
    INTO intent_session, intent_policy, intent_type, intent_side, intent_slot, intent_attempt, intent_status
  FROM "DocumentUploadIntent" WHERE id = NEW."uploadIntentId";
  SELECT "documentPolicyConfigVersionId" INTO release_policy
  FROM "BusinessConfigurationRelease" WHERE id = NEW."configurationReleaseId";

  IF session_customer IS NULL OR session_customer <> NEW."customerUserId" OR
     session_release <> NEW."configurationReleaseId" OR session_policy <> NEW."documentPolicyConfigVersionId" OR
     intent_session <> NEW."uploadSessionId" OR intent_policy <> NEW."documentPolicyConfigVersionId" OR
     intent_type <> NEW."documentTypeId" OR intent_side <> NEW.side OR intent_slot <> NEW."slotNumber" OR
     intent_attempt <> NEW."attemptNumber" OR release_policy <> NEW."documentPolicyConfigVersionId" THEN
    RAISE EXCEPTION 'CustomerDocument Phase 8 provenance is inconsistent';
  END IF;
  IF NEW."uploadStatus" = 'READY' AND intent_status <> 'CLEAN' THEN
    RAISE EXCEPTION 'READY CustomerDocument requires a CLEAN upload intent';
  END IF;

  IF NEW."bookingId" IS NOT NULL THEN
    SELECT booking."userId", pricing."configurationReleaseId" INTO booking_user, booking_release
    FROM "Booking" booking JOIN "BookingPricingSnapshot" pricing ON pricing."bookingId" = booking.id
    WHERE booking.id = NEW."bookingId";
    IF booking_user IS NULL OR booking_user <> NEW."customerUserId" OR booking_release <> NEW."configurationReleaseId" THEN
      RAISE EXCEPTION 'CustomerDocument Booking provenance is inconsistent';
    END IF;
  END IF;

  IF NEW."replacesDocumentId" = NEW.id THEN
    RAISE EXCEPTION 'CustomerDocument cannot replace itself';
  END IF;
  IF NEW."replacesDocumentId" IS NOT NULL THEN
    SELECT * INTO prior FROM "CustomerDocument" WHERE id = NEW."replacesDocumentId";
    IF prior.id IS NULL OR prior."uploadSessionId" <> NEW."uploadSessionId" OR prior."customerUserId" <> NEW."customerUserId" OR
       prior."documentTypeId" <> NEW."documentTypeId" OR prior.side <> NEW.side OR prior."slotNumber" <> NEW."slotNumber" OR
       prior."attemptNumber" >= NEW."attemptNumber" OR prior."isCurrent" = true THEN
      RAISE EXCEPTION 'CustomerDocument replacement predecessor is inconsistent or still current';
    END IF;
    WITH RECURSIVE chain(id, parent_id) AS (
      SELECT id, "replacesDocumentId" FROM "CustomerDocument" WHERE id = NEW."replacesDocumentId"
      UNION ALL
      SELECT document.id, document."replacesDocumentId"
      FROM "CustomerDocument" document JOIN chain ON document.id = chain.parent_id
    ) SELECT EXISTS(SELECT 1 FROM chain WHERE id = NEW.id) INTO cycle_found;
    IF cycle_found THEN RAISE EXCEPTION 'CustomerDocument replacement chain cannot contain a cycle'; END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."uploadStatus" <> NEW."uploadStatus" AND NOT (
    (OLD."uploadStatus" = 'UPLOADED' AND NEW."uploadStatus" IN ('VERIFYING','REJECTED','FAILED')) OR
    (OLD."uploadStatus" = 'VERIFYING' AND NEW."uploadStatus" IN ('READY','REJECTED','FAILED'))
  ) THEN
    RAISE EXCEPTION 'Invalid CustomerDocument upload transition % -> %', OLD."uploadStatus", NEW."uploadStatus";
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."quarantineStatus" IS DISTINCT FROM NEW."quarantineStatus" AND NOT (
    (OLD."quarantineStatus" = 'QUARANTINED' AND NEW."quarantineStatus" IN ('RELEASED','REJECTED','DELETED')) OR
    (OLD."quarantineStatus" IN ('RELEASED','REJECTED') AND NEW."quarantineStatus" = 'DELETED')
  ) THEN
    RAISE EXCEPTION 'Invalid CustomerDocument quarantine transition';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."uploadStatus" IN ('READY','REJECTED','FAILED') THEN
    IF (to_jsonb(NEW) - ARRAY['isCurrent','retentionUntil','retentionBasis','retentionBasisAt','retentionPolicyDaysSnapshot','hardRetentionDaysSnapshot','deletionEligibleAt','legalHold','deletionStatus','deletedAt','deletionReason','quarantineStatus','updatedAt']) <>
       (to_jsonb(OLD) - ARRAY['isCurrent','retentionUntil','retentionBasis','retentionBasisAt','retentionPolicyDaysSnapshot','hardRetentionDaysSnapshot','deletionEligibleAt','legalHold','deletionStatus','deletedAt','deletionReason','quarantineStatus','updatedAt']) THEN
      RAISE EXCEPTION 'Completed CustomerDocument evidence is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CustomerDocument_phase8_lifecycle"
BEFORE INSERT OR UPDATE ON "CustomerDocument"
FOR EACH ROW EXECUTE FUNCTION enforce_phase8_customer_document();

CREATE OR REPLACE FUNCTION protect_document_scan_attempt()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_attempt integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'DocumentMalwareScanAttempt rows are append-only';
  END IF;
  SELECT COALESCE(max("attemptNumber"), 0) + 1 INTO expected_attempt
  FROM "DocumentMalwareScanAttempt" WHERE "customerDocumentId" = NEW."customerDocumentId";
  IF NEW."attemptNumber" <> expected_attempt THEN
    RAISE EXCEPTION 'Malware scan attempt number must be the next monotonic value';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentMalwareScanAttempt_append_only"
BEFORE INSERT OR UPDATE OR DELETE ON "DocumentMalwareScanAttempt"
FOR EACH ROW EXECUTE FUNCTION protect_document_scan_attempt();

CREATE OR REPLACE FUNCTION enforce_document_scan_summary()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  document_id text;
  summary_status "MalwareScanStatus";
  summary_count integer;
  summary_requested timestamp(3);
  latest_status "MalwareScanStatus";
  latest_number integer;
  latest_completed timestamp(3);
BEGIN
  IF TG_TABLE_NAME = 'CustomerDocument' THEN
    document_id := NEW.id;
  ELSE
    document_id := NEW."customerDocumentId";
  END IF;
  SELECT "scanStatus", "scanAttemptCount", "scanRequestedAt" INTO summary_status, summary_count, summary_requested
  FROM "CustomerDocument" WHERE id = document_id;
  SELECT outcome, "attemptNumber", "completedAt" INTO latest_status, latest_number, latest_completed
  FROM "DocumentMalwareScanAttempt" WHERE "customerDocumentId" = document_id ORDER BY "attemptNumber" DESC LIMIT 1;
  IF latest_number IS NULL THEN
    IF summary_count <> 0 THEN RAISE EXCEPTION 'Scan summary count has no attempt evidence'; END IF;
  ELSIF summary_count <> latest_number OR NOT (
    summary_status = latest_status OR
    (summary_status = 'PENDING' AND summary_requested IS NOT NULL AND summary_requested >= latest_completed)
  ) THEN
    RAISE EXCEPTION 'CustomerDocument scan summary is inconsistent with latest attempt';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "DocumentMalwareScanAttempt_summary_consistency"
AFTER INSERT ON "DocumentMalwareScanAttempt" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_document_scan_summary();

CREATE CONSTRAINT TRIGGER "CustomerDocument_scan_summary_consistency"
AFTER INSERT OR UPDATE OF "scanStatus", "scanAttemptCount", "scanRequestedAt" ON "CustomerDocument"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_document_scan_summary();

CREATE OR REPLACE FUNCTION enforce_document_legal_hold()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'DocumentLegalHold history cannot be deleted'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."releasedAt" IS NOT NULL THEN RAISE EXCEPTION 'Released DocumentLegalHold is immutable'; END IF;
    IF NEW."customerDocumentId" <> OLD."customerDocumentId" OR NEW.reason <> OLD.reason OR
       NEW."appliedById" <> OLD."appliedById" OR NEW."appliedAt" <> OLD."appliedAt" OR
       NEW."reviewAt" IS DISTINCT FROM OLD."reviewAt" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" THEN
      RAISE EXCEPTION 'DocumentLegalHold application evidence is immutable';
    END IF;
    IF NEW."releasedAt" IS NULL OR NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'DocumentLegalHold release requires complete evidence and next revision';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentLegalHold_lifecycle"
BEFORE INSERT OR UPDATE OR DELETE ON "DocumentLegalHold"
FOR EACH ROW EXECUTE FUNCTION enforce_document_legal_hold();

CREATE OR REPLACE FUNCTION enforce_document_hold_summary()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document_id text; summary boolean; active boolean;
BEGIN
  IF TG_TABLE_NAME = 'CustomerDocument' THEN
    document_id := NEW.id;
  ELSE
    document_id := NEW."customerDocumentId";
  END IF;
  SELECT "legalHold" INTO summary FROM "CustomerDocument" WHERE id = document_id;
  SELECT EXISTS(SELECT 1 FROM "DocumentLegalHold" WHERE "customerDocumentId" = document_id AND "releasedAt" IS NULL) INTO active;
  IF summary IS DISTINCT FROM active THEN RAISE EXCEPTION 'CustomerDocument legal-hold summary is inconsistent'; END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "DocumentLegalHold_summary_consistency"
AFTER INSERT OR UPDATE ON "DocumentLegalHold" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_document_hold_summary();

CREATE CONSTRAINT TRIGGER "CustomerDocument_hold_summary_consistency"
AFTER INSERT OR UPDATE OF "legalHold" ON "CustomerDocument" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW."evidenceSchemaVersion" >= 2) EXECUTE FUNCTION enforce_document_hold_summary();

CREATE OR REPLACE FUNCTION protect_document_deletion_attempt()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_attempt integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'DocumentDeletionAttempt rows are append-only'; END IF;
  SELECT COALESCE(max("attemptNumber"), 0) + 1 INTO expected_attempt
  FROM "DocumentDeletionAttempt" WHERE "deletionRequestId" = NEW."deletionRequestId";
  IF NEW."attemptNumber" <> expected_attempt THEN
    RAISE EXCEPTION 'Deletion attempt number must be the next monotonic value';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentDeletionAttempt_append_only"
BEFORE INSERT OR UPDATE OR DELETE ON "DocumentDeletionAttempt"
FOR EACH ROW EXECUTE FUNCTION protect_document_deletion_attempt();

CREATE OR REPLACE FUNCTION enforce_document_deletion_request()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE held boolean; verified boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'DocumentDeletionRequest history cannot be deleted'; END IF;
  SELECT EXISTS(SELECT 1 FROM "DocumentLegalHold" WHERE "customerDocumentId" = NEW."customerDocumentId" AND "releasedAt" IS NULL) INTO held;
  IF held THEN RAISE EXCEPTION 'Active legal hold blocks document deletion'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'COMPLETED' THEN RAISE EXCEPTION 'Completed DocumentDeletionRequest is immutable'; END IF;
    IF NEW."customerDocumentId" <> OLD."customerDocumentId" OR NEW."idempotencyKey" <> OLD."idempotencyKey" OR
       NEW."requestedById" IS DISTINCT FROM OLD."requestedById" OR NEW.reason <> OLD.reason OR
       NEW."requestedAt" <> OLD."requestedAt" OR
       NEW."eligibleAt" <> OLD."eligibleAt" OR NEW."mustCompleteBy" <> OLD."mustCompleteBy" OR
       NEW.revision <> OLD.revision + 1 OR NOT (
         (OLD.status = 'SCHEDULED' AND NEW.status IN ('IN_PROGRESS','FAILED')) OR
         (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('COMPLETED','FAILED')) OR
         (OLD.status = 'FAILED' AND NEW.status = 'IN_PROGRESS')
       ) THEN RAISE EXCEPTION 'Invalid DocumentDeletionRequest transition'; END IF;
  END IF;
  IF NEW.status = 'COMPLETED' THEN
    SELECT EXISTS(
      SELECT 1 FROM "DocumentDeletionAttempt"
      WHERE "deletionRequestId" = NEW.id AND outcome IN ('DELETED','ALREADY_MISSING')
        AND "providerConfirmationRef" = NEW."providerConfirmationRef"
    ) INTO verified;
    IF NOT verified THEN RAISE EXCEPTION 'Verified provider outcome is required before deletion completion'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentDeletionRequest_lifecycle"
BEFORE INSERT OR UPDATE OR DELETE ON "DocumentDeletionRequest"
FOR EACH ROW EXECUTE FUNCTION enforce_document_deletion_request();

CREATE OR REPLACE FUNCTION enforce_customer_document_deletion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE held boolean; verified boolean;
BEGIN
  IF OLD."deletionStatus" <> NEW."deletionStatus" AND NOT (
    (OLD."deletionStatus" = 'RETAINED' AND NEW."deletionStatus" = 'SCHEDULED') OR
    (OLD."deletionStatus" = 'SCHEDULED' AND NEW."deletionStatus" IN ('DELETED','FAILED')) OR
    (OLD."deletionStatus" = 'FAILED' AND NEW."deletionStatus" = 'SCHEDULED')
  ) THEN
    RAISE EXCEPTION 'Invalid CustomerDocument deletion transition % -> %', OLD."deletionStatus", NEW."deletionStatus";
  END IF;
  IF NEW."deletionStatus" IN ('SCHEDULED','DELETED') THEN
    SELECT EXISTS(SELECT 1 FROM "DocumentLegalHold" WHERE "customerDocumentId" = NEW.id AND "releasedAt" IS NULL) INTO held;
    IF held THEN RAISE EXCEPTION 'Active legal hold blocks CustomerDocument deletion'; END IF;
  END IF;
  IF NEW."deletionStatus" = 'DELETED' AND OLD."deletionStatus" <> 'DELETED' THEN
    SELECT EXISTS(
      SELECT 1 FROM "DocumentDeletionRequest" request
      WHERE request."customerDocumentId" = NEW.id AND request.status = 'COMPLETED'
        AND request."providerConfirmedAt" IS NOT NULL
    ) INTO verified;
    IF NOT verified THEN RAISE EXCEPTION 'CustomerDocument DELETED requires verified provider deletion'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CustomerDocument_deletion_lifecycle"
BEFORE UPDATE OF "deletionStatus" ON "CustomerDocument"
FOR EACH ROW EXECUTE FUNCTION enforce_customer_document_deletion();
