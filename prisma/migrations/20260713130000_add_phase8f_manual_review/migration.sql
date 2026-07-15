-- Phase 8F-A: additive manual-review evidence and lifecycle support.
-- Existing scanner-backed READY/CLEAN evidence remains unchanged. Existing rows
-- receive only NOT_READY/revision-0 defaults and no decision history is fabricated.

CREATE TYPE "DocumentManualReviewStatus" AS ENUM (
  'NOT_READY', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REPLACEMENT_REQUIRED'
);
CREATE TYPE "DocumentReviewDecision" AS ENUM ('APPROVED', 'REJECTED', 'REPLACEMENT_REQUIRED');
CREATE TYPE "DocumentReviewReason" AS ENUM (
  'UNREADABLE', 'CROPPED', 'WRONG_DOCUMENT', 'WRONG_SIDE', 'EXPIRED',
  'DETAILS_MISMATCH', 'MISSING_INFORMATION', 'SUSPECTED_ALTERATION',
  'DUPLICATE', 'OTHER'
);

ALTER TYPE "CustomerDocumentUploadStatus" ADD VALUE 'TECHNICALLY_VALID';
ALTER TYPE "DocumentUploadIntentStatus" ADD VALUE 'TECHNICALLY_VALID';

-- PostgreSQL does not permit an enum value added in this transaction to be used as
-- an enum literal until commit. Every same-migration predicate below compares the
-- enum column's text representation, keeping this a single atomic Prisma migration.

ALTER TABLE "CustomerDocument"
  ADD COLUMN "manualReviewStatus" "DocumentManualReviewStatus" NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN "reviewRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewReasonCode" "DocumentReviewReason",
  ADD COLUMN "safeReviewerNote" VARCHAR(500);

CREATE TABLE "CustomerDocumentReviewDecision" (
  "id" TEXT NOT NULL,
  "customerDocumentId" TEXT NOT NULL,
  "decisionVersion" INTEGER NOT NULL,
  "previousStatus" "DocumentManualReviewStatus" NOT NULL,
  "decision" "DocumentReviewDecision" NOT NULL,
  "reasonCode" "DocumentReviewReason",
  "safeReviewerNote" VARCHAR(500),
  "reviewedById" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "configurationReleaseId" TEXT NOT NULL,
  "documentPolicyConfigVersionId" TEXT NOT NULL,
  "documentRequirementTypeId" TEXT NOT NULL,
  "uploadSessionId" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "slotNumber" INTEGER NOT NULL,
  "side" "DocumentSide" NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerDocumentReviewDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerDocumentReviewDecision_reviewedById_reviewedAt_idx"
  ON "CustomerDocumentReviewDecision"("reviewedById", "reviewedAt");
CREATE INDEX "CustomerDocumentReviewDecision_decision_reviewedAt_idx"
  ON "CustomerDocumentReviewDecision"("decision", "reviewedAt");
CREATE INDEX "CustomerDocumentReviewDecision_configurationReleaseId_revie_idx"
  ON "CustomerDocumentReviewDecision"("configurationReleaseId", "reviewedAt");
CREATE INDEX "CustomerDocumentReviewDecision_documentPolicyConfigVersionI_idx"
  ON "CustomerDocumentReviewDecision"("documentPolicyConfigVersionId", "documentRequirementTypeId");
CREATE INDEX "CustomerDocumentReviewDecision_uploadSessionId_reviewedAt_idx"
  ON "CustomerDocumentReviewDecision"("uploadSessionId", "reviewedAt");
CREATE INDEX "CustomerDocumentReviewDecision_customerUserId_reviewedAt_idx"
  ON "CustomerDocumentReviewDecision"("customerUserId", "reviewedAt");
CREATE UNIQUE INDEX "CustomerDocumentReviewDecision_customerDocumentId_decisionV_key"
  ON "CustomerDocumentReviewDecision"("customerDocumentId", "decisionVersion");

CREATE INDEX "CustomerDocument_manualReviewStatus_idx"
  ON "CustomerDocument"("manualReviewStatus");
CREATE INDEX "CustomerDocument_reviewedById_reviewedAt_idx"
  ON "CustomerDocument"("reviewedById", "reviewedAt");
CREATE INDEX "CustomerDocument_manualReviewStatus_createdAt_id_idx"
  ON "CustomerDocument"("manualReviewStatus", "createdAt", id);
CREATE INDEX "CustomerDocument_manualReviewStatus_metadataVerifiedAt_id_idx"
  ON "CustomerDocument"("manualReviewStatus", "metadataVerifiedAt", id);

ALTER TABLE "CustomerDocument"
  ADD CONSTRAINT "CustomerDocument_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerDocumentReviewDecision"
  ADD CONSTRAINT "CustomerDocumentReviewDecision_customerDocumentId_fkey"
  FOREIGN KEY ("customerDocumentId") REFERENCES "CustomerDocument"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerDocumentReviewDecision_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerDocumentReviewDecision_customerUserId_fkey"
  FOREIGN KEY ("customerUserId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerDocumentReviewDecision_configurationReleaseId_fkey"
  FOREIGN KEY ("configurationReleaseId") REFERENCES "BusinessConfigurationRelease"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerDocumentReviewDecision_documentPolicyConfigVersion_fkey"
  FOREIGN KEY ("documentPolicyConfigVersionId", "documentRequirementTypeId")
  REFERENCES "DocumentRequirementRule"("documentPolicyConfigVersionId", "documentTypeId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerDocumentReviewDecision_uploadSessionId_fkey"
  FOREIGN KEY ("uploadSessionId") REFERENCES "DocumentUploadSession"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- The original intent check cannot admit the new terminal technical-validation
-- state, so replace it in this forward migration without changing any data.
ALTER TABLE "DocumentUploadIntent" DROP CONSTRAINT "DocumentUploadIntent_shape_check";
ALTER TABLE "DocumentUploadIntent"
  ADD CONSTRAINT "DocumentUploadIntent_shape_check" CHECK (
    "slotNumber" > 0 AND "attemptNumber" > 0 AND "filePolicyVersion" > 0 AND
    revision > 0 AND "expectedSizeBytes" BETWEEN 1 AND 10485760 AND
    "expectedChecksumSha256" ~ '^[0-9a-f]{64}$' AND
    "normalizedExtension" IN ('.pdf', '.jpg', '.jpeg', '.png') AND
    "declaredMimeType" IN ('application/pdf', 'image/jpeg', 'image/png') AND
    "cleanupEligibleAt" >= "expiresAt" AND
    ("failureCode" IS NULL OR "failureCode" ~ '^[A-Z0-9_]{1,64}$') AND
    (
      (status IN ('INTENT_CREATED', 'UPLOADING') AND "uploadCompletedAt" IS NULL AND "completedAt" IS NULL AND "abortedAt" IS NULL) OR
      (status = 'UPLOADED' AND "uploadCompletedAt" IS NOT NULL AND "completedAt" IS NULL AND "abortedAt" IS NULL) OR
      (status IN ('VERIFYING', 'QUARANTINED', 'SCAN_PENDING') AND "uploadCompletedAt" IS NOT NULL AND "verificationStartedAt" IS NOT NULL AND "completedAt" IS NULL AND "abortedAt" IS NULL) OR
      (status::text IN ('TECHNICALLY_VALID', 'CLEAN') AND "uploadCompletedAt" IS NOT NULL AND "verificationStartedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "abortedAt" IS NULL AND "failureCode" IS NULL) OR
      (status IN ('REJECTED', 'FAILED') AND "completedAt" IS NOT NULL AND "failureCode" IS NOT NULL AND "abortedAt" IS NULL) OR
      (status = 'ABORTED' AND "completedAt" IS NULL AND "abortedAt" IS NOT NULL) OR
      (status = 'EXPIRED' AND "completedAt" IS NULL AND "abortedAt" IS NULL)
    )
  );

ALTER TABLE "CustomerDocumentReviewDecision"
  ADD CONSTRAINT "CustomerDocumentReviewDecision_shape_check" CHECK (
    "decisionVersion" > 0 AND "slotNumber" > 0 AND "attemptNumber" > 0 AND
    "previousStatus" = 'PENDING_REVIEW' AND
    (
      "safeReviewerNote" IS NULL OR
      (
        length(btrim("safeReviewerNote")) BETWEEN 1 AND 500 AND
        "safeReviewerNote" = btrim("safeReviewerNote") AND
        "safeReviewerNote" !~ '[<>]' AND
        "safeReviewerNote" !~* '(https?://|www\\.|(^|[[:space:]])([a-z0-9-]+\\.)+[a-z]{2,}([/:?]|$))'
      )
    ) AND
    (
      (decision = 'APPROVED' AND "reasonCode" IS NULL) OR
      (decision IN ('REJECTED', 'REPLACEMENT_REQUIRED') AND "reasonCode" IS NOT NULL)
    ) AND
    ("reasonCode" <> 'OTHER' OR "safeReviewerNote" IS NOT NULL)
  );

ALTER TABLE "CustomerDocument"
  ADD CONSTRAINT "CustomerDocument_manual_review_shape_check" CHECK (
    "reviewRevision" >= 0 AND
    (
      "safeReviewerNote" IS NULL OR
      (
        length(btrim("safeReviewerNote")) BETWEEN 1 AND 500 AND
        "safeReviewerNote" = btrim("safeReviewerNote") AND
        "safeReviewerNote" !~ '[<>]' AND
        "safeReviewerNote" !~* '(https?://|www\\.|(^|[[:space:]])([a-z0-9-]+\\.)+[a-z]{2,}([/:?]|$))'
      )
    ) AND
    (
      (
        "reviewRevision" = 0 AND
        "manualReviewStatus" IN ('NOT_READY', 'PENDING_REVIEW') AND
        "reviewedById" IS NULL AND "reviewedAt" IS NULL AND
        "reviewReasonCode" IS NULL AND "safeReviewerNote" IS NULL
      ) OR
      (
        "reviewRevision" > 0 AND
        "manualReviewStatus" IN ('APPROVED', 'REJECTED', 'REPLACEMENT_REQUIRED') AND
        "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND
        (
          ("manualReviewStatus" = 'APPROVED' AND "reviewReasonCode" IS NULL) OR
          ("manualReviewStatus" IN ('REJECTED', 'REPLACEMENT_REQUIRED') AND "reviewReasonCode" IS NOT NULL)
        ) AND
        ("reviewReasonCode" <> 'OTHER' OR "safeReviewerNote" IS NOT NULL)
      )
    ) AND
    (
      "manualReviewStatus" = 'NOT_READY' OR
      (
        "evidenceSchemaVersion" = 2 AND
        "uploadStatus"::text = 'TECHNICALLY_VALID' AND
        "metadataVerifiedAt" IS NOT NULL AND "verificationFailureCode" IS NULL AND
        "scanStatus" = 'NOT_AVAILABLE' AND "scanAttemptCount" = 0 AND
        "scanProviderReference" IS NULL AND "scanRequestedAt" IS NULL AND
        "scanCompletedAt" IS NULL AND "scanResultCode" IS NULL AND
        (
          ("manualReviewStatus" = 'PENDING_REVIEW' AND "quarantineStatus" = 'QUARANTINED') OR
          ("manualReviewStatus" = 'APPROVED' AND "quarantineStatus" = 'RELEASED' AND "releasedFromQuarantineAt" IS NOT NULL) OR
          ("manualReviewStatus" IN ('REJECTED', 'REPLACEMENT_REQUIRED') AND "quarantineStatus" = 'REJECTED')
        )
      )
    )
  ) NOT VALID;
ALTER TABLE "CustomerDocument" VALIDATE CONSTRAINT "CustomerDocument_manual_review_shape_check";

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
       NEW."storageKey" <> OLD."storageKey" THEN
      RAISE EXCEPTION 'Document upload intent binding and object identity are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
  active_pending boolean;
  terminal_candidate boolean;
BEGIN
  IF NEW."evidenceSchemaVersion" = 1 THEN RETURN NEW; END IF;
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
  IF NEW."uploadStatus"::text = 'TECHNICALLY_VALID' AND intent_status::text <> 'TECHNICALLY_VALID' THEN
    RAISE EXCEPTION 'TECHNICALLY_VALID CustomerDocument requires matching technical intent evidence';
  END IF;

  IF NEW."bookingId" IS NOT NULL THEN
    SELECT booking."userId", pricing."configurationReleaseId" INTO booking_user, booking_release
    FROM "Booking" booking JOIN "BookingPricingSnapshot" pricing ON pricing."bookingId" = booking.id
    WHERE booking.id = NEW."bookingId";
    IF booking_user IS NULL OR booking_user <> NEW."customerUserId" OR booking_release <> NEW."configurationReleaseId" THEN
      RAISE EXCEPTION 'CustomerDocument Booking provenance is inconsistent';
    END IF;
  END IF;

  active_pending :=
    NEW."uploadStatus" IN ('UPLOADED', 'VERIFYING') OR
    (NEW."uploadStatus"::text = 'TECHNICALLY_VALID' AND NEW."manualReviewStatus" = 'PENDING_REVIEW');
  terminal_candidate :=
    NEW."uploadStatus" IN ('REJECTED', 'FAILED') OR
    NEW."manualReviewStatus" IN ('REJECTED', 'REPLACEMENT_REQUIRED');

  IF NEW."replacesDocumentId" = NEW.id THEN RAISE EXCEPTION 'CustomerDocument cannot replace itself'; END IF;
  IF TG_OP = 'UPDATE' AND NEW."replacesDocumentId" IS DISTINCT FROM OLD."replacesDocumentId" THEN
    RAISE EXCEPTION 'CustomerDocument replacement predecessor is immutable';
  END IF;
  IF NEW."replacesDocumentId" IS NOT NULL THEN
    SELECT * INTO prior FROM "CustomerDocument" WHERE id = NEW."replacesDocumentId";
    IF prior.id IS NULL OR prior."uploadSessionId" <> NEW."uploadSessionId" OR prior."customerUserId" <> NEW."customerUserId" OR
       prior."documentTypeId" <> NEW."documentTypeId" OR prior.side <> NEW.side OR prior."slotNumber" <> NEW."slotNumber" OR
       prior."attemptNumber" >= NEW."attemptNumber" THEN
      RAISE EXCEPTION 'CustomerDocument replacement predecessor is inconsistent';
    END IF;
    IF TG_OP = 'INSERT' AND NOT (
      prior."isCurrent" = true AND NEW."isCurrent" = false AND active_pending AND NEW."deletionStatus" <> 'DELETED'
    ) THEN
      RAISE EXCEPTION 'New replacement must be active pending while its predecessor remains current';
    END IF;
    IF prior."isCurrent" = true AND NOT (NEW."isCurrent" = false AND (active_pending OR terminal_candidate)) THEN
      RAISE EXCEPTION 'Current predecessor permits only a non-current pending or terminal replacement';
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
    (OLD."uploadStatus" = 'VERIFYING' AND NEW."uploadStatus"::text IN ('TECHNICALLY_VALID','READY','REJECTED','FAILED'))
  ) THEN
    RAISE EXCEPTION 'Invalid CustomerDocument upload transition % -> %', OLD."uploadStatus", NEW."uploadStatus";
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."quarantineStatus" IS DISTINCT FROM NEW."quarantineStatus" AND NOT (
    (OLD."quarantineStatus" = 'QUARANTINED' AND NEW."quarantineStatus" IN ('RELEASED','REJECTED','DELETED')) OR
    (OLD."quarantineStatus" IN ('RELEASED','REJECTED') AND NEW."quarantineStatus" = 'DELETED')
  ) THEN
    RAISE EXCEPTION 'Invalid CustomerDocument quarantine transition';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."uploadStatus"::text IN ('TECHNICALLY_VALID','READY','REJECTED','FAILED') THEN
    IF (to_jsonb(NEW) - ARRAY[
      'isCurrent','retentionUntil','retentionBasis','retentionBasisAt','retentionPolicyDaysSnapshot',
      'hardRetentionDaysSnapshot','deletionEligibleAt','legalHold','deletionStatus','deletedAt',
      'deletionReason','quarantineStatus','releasedFromQuarantineAt','manualReviewStatus',
      'reviewRevision','reviewedById','reviewedAt','reviewReasonCode','safeReviewerNote','updatedAt'
    ]) <> (to_jsonb(OLD) - ARRAY[
      'isCurrent','retentionUntil','retentionBasis','retentionBasisAt','retentionPolicyDaysSnapshot',
      'hardRetentionDaysSnapshot','deletionEligibleAt','legalHold','deletionStatus','deletedAt',
      'deletionReason','quarantineStatus','releasedFromQuarantineAt','manualReviewStatus',
      'reviewRevision','reviewedById','reviewedAt','reviewReasonCode','safeReviewerNote','updatedAt'
    ]) THEN
      RAISE EXCEPTION 'Completed CustomerDocument technical evidence is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_customer_document_review_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."reviewRevision" < 0 THEN RAISE EXCEPTION 'Document review revision cannot be negative'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."manualReviewStatus" <> NEW."manualReviewStatus" AND NOT (
      (OLD."manualReviewStatus" = 'NOT_READY' AND NEW."manualReviewStatus" = 'PENDING_REVIEW') OR
      (OLD."manualReviewStatus" = 'PENDING_REVIEW' AND NEW."manualReviewStatus" IN ('APPROVED','REJECTED','REPLACEMENT_REQUIRED'))
    ) THEN
      RAISE EXCEPTION 'Invalid manual review transition % -> %', OLD."manualReviewStatus", NEW."manualReviewStatus";
    END IF;
    IF OLD."manualReviewStatus" IN ('APPROVED','REJECTED','REPLACEMENT_REQUIRED') AND
       to_jsonb(NEW) <> to_jsonb(OLD) THEN
      -- Technical evidence is already protected separately; terminal review summary
      -- may only participate in retention/deletion/current-state operations.
      IF (to_jsonb(NEW) - ARRAY[
        'isCurrent','retentionUntil','retentionBasis','retentionBasisAt','retentionPolicyDaysSnapshot',
        'hardRetentionDaysSnapshot','deletionEligibleAt','legalHold','deletionStatus','deletedAt',
        'deletionReason','quarantineStatus','updatedAt'
      ]) <> (to_jsonb(OLD) - ARRAY[
        'isCurrent','retentionUntil','retentionBasis','retentionBasisAt','retentionPolicyDaysSnapshot',
        'hardRetentionDaysSnapshot','deletionEligibleAt','legalHold','deletionStatus','deletedAt',
        'deletionReason','quarantineStatus','updatedAt'
      ]) THEN
        RAISE EXCEPTION 'Terminal manual review evidence is immutable';
      END IF;
    END IF;
    IF OLD."manualReviewStatus" = 'NOT_READY' AND NEW."manualReviewStatus" = 'PENDING_REVIEW' AND
       NEW."reviewRevision" <> 0 THEN
      RAISE EXCEPTION 'Pending review begins without a decision revision';
    END IF;
    IF OLD."manualReviewStatus" = 'PENDING_REVIEW' AND NEW."manualReviewStatus" IN ('APPROVED','REJECTED','REPLACEMENT_REQUIRED') AND
       NEW."reviewRevision" <> OLD."reviewRevision" + 1 THEN
      RAISE EXCEPTION 'Manual review decision requires the next optimistic revision';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CustomerDocument_manual_review_transition"
BEFORE INSERT OR UPDATE ON "CustomerDocument"
FOR EACH ROW EXECUTE FUNCTION enforce_customer_document_review_transition();

CREATE OR REPLACE FUNCTION protect_customer_document_review_decision()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  document "CustomerDocument"%ROWTYPE;
  expected_next integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'CustomerDocumentReviewDecision rows are append-only'; END IF;

  SELECT * INTO document FROM "CustomerDocument" WHERE id = NEW."customerDocumentId" FOR UPDATE;
  IF document.id IS NULL THEN RAISE EXCEPTION 'Review decision document does not exist'; END IF;
  SELECT COALESCE(max("decisionVersion"), 0) + 1 INTO expected_next
  FROM "CustomerDocumentReviewDecision" WHERE "customerDocumentId" = NEW."customerDocumentId";
  IF NEW."decisionVersion" <> expected_next THEN
    RAISE EXCEPTION 'Review decision version must be the next locked value';
  END IF;
  IF NEW."decisionVersion" NOT IN (document."reviewRevision", document."reviewRevision" + 1) THEN
    RAISE EXCEPTION 'Review decision version conflicts with optimistic document revision';
  END IF;
  IF NEW."previousStatus" <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'Review decisions require a PENDING_REVIEW predecessor';
  END IF;
  IF document."configurationReleaseId" IS NULL OR document."documentPolicyConfigVersionId" IS NULL OR
     document."documentRequirementTypeId" IS NULL OR document."uploadSessionId" IS NULL OR
     document."slotNumber" IS NULL OR document."attemptNumber" IS NULL OR
     NEW."configurationReleaseId" <> document."configurationReleaseId" OR
     NEW."documentPolicyConfigVersionId" <> document."documentPolicyConfigVersionId" OR
     NEW."documentRequirementTypeId" <> document."documentRequirementTypeId" OR
     NEW."uploadSessionId" <> document."uploadSessionId" OR
     NEW."customerUserId" <> document."customerUserId" OR NEW."slotNumber" <> document."slotNumber" OR
     NEW.side <> document.side OR NEW."attemptNumber" <> document."attemptNumber" THEN
    RAISE EXCEPTION 'Review decision provenance does not match immutable document evidence';
  END IF;
  NEW."reviewedAt" := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CustomerDocumentReviewDecision_append_only"
BEFORE INSERT OR UPDATE OR DELETE ON "CustomerDocumentReviewDecision"
FOR EACH ROW EXECUTE FUNCTION protect_customer_document_review_decision();

CREATE OR REPLACE FUNCTION enforce_customer_document_review_summary()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  document_id text;
  summary "CustomerDocument"%ROWTYPE;
  latest "CustomerDocumentReviewDecision"%ROWTYPE;
  decision_count integer;
BEGIN
  IF TG_TABLE_NAME = 'CustomerDocument' THEN document_id := NEW.id;
  ELSE document_id := NEW."customerDocumentId";
  END IF;
  SELECT * INTO summary FROM "CustomerDocument" WHERE id = document_id;
  SELECT * INTO latest FROM "CustomerDocumentReviewDecision"
  WHERE "customerDocumentId" = document_id ORDER BY "decisionVersion" DESC LIMIT 1;
  SELECT count(*) INTO decision_count FROM "CustomerDocumentReviewDecision" WHERE "customerDocumentId" = document_id;

  IF summary."reviewRevision" = 0 THEN
    IF decision_count <> 0 OR summary."manualReviewStatus" NOT IN ('NOT_READY','PENDING_REVIEW') OR
       summary."reviewedById" IS NOT NULL OR summary."reviewedAt" IS NOT NULL OR
       summary."reviewReasonCode" IS NOT NULL OR summary."safeReviewerNote" IS NOT NULL THEN
      RAISE EXCEPTION 'Revision-zero manual review summary is inconsistent';
    END IF;
  ELSIF latest.id IS NULL OR decision_count <> summary."reviewRevision" OR
        latest."decisionVersion" <> summary."reviewRevision" OR
        latest.decision::text <> summary."manualReviewStatus"::text OR
        latest."reviewedById" IS DISTINCT FROM summary."reviewedById" OR
        latest."reviewedAt" IS DISTINCT FROM summary."reviewedAt" OR
        latest."reasonCode" IS DISTINCT FROM summary."reviewReasonCode" OR
        latest."safeReviewerNote" IS DISTINCT FROM summary."safeReviewerNote" THEN
    RAISE EXCEPTION 'CustomerDocument review summary does not match latest authoritative decision';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "CustomerDocument_review_summary_consistency"
AFTER INSERT OR UPDATE OF "manualReviewStatus", "reviewRevision", "reviewedById", "reviewedAt", "reviewReasonCode", "safeReviewerNote"
ON "CustomerDocument" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_customer_document_review_summary();
CREATE CONSTRAINT TRIGGER "CustomerDocumentReviewDecision_summary_consistency"
AFTER INSERT ON "CustomerDocumentReviewDecision" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_customer_document_review_summary();

-- Detect conflicting active manual replacements before installing the expanded
-- predicate. Never delete data or choose a winner automatically.
DO $$
DECLARE duplicate_predecessors text;
BEGIN
  SELECT string_agg(duplicate."replacesDocumentId", ', ' ORDER BY duplicate."replacesDocumentId")
  INTO duplicate_predecessors
  FROM (
    SELECT "replacesDocumentId"
    FROM "CustomerDocument"
    WHERE "evidenceSchemaVersion" >= 2 AND "replacesDocumentId" IS NOT NULL AND "isCurrent" = false
      AND "deletionStatus" <> 'DELETED'
      AND (
        "uploadStatus" IN ('UPLOADED','VERIFYING') OR
        "manualReviewStatus" = 'PENDING_REVIEW'
      )
    GROUP BY "replacesDocumentId" HAVING count(*) > 1
  ) duplicate;
  IF duplicate_predecessors IS NOT NULL THEN
    RAISE EXCEPTION 'Multiple active pending replacements require manual review for predecessor(s): %', duplicate_predecessors;
  END IF;
END;
$$;

CREATE UNIQUE INDEX "CustomerDocument_one_active_pending_replacement_v2_key"
ON "CustomerDocument"("replacesDocumentId")
WHERE "evidenceSchemaVersion" >= 2 AND "replacesDocumentId" IS NOT NULL AND "isCurrent" = false
  AND "deletionStatus" <> 'DELETED'
  AND (
    "uploadStatus" IN ('UPLOADED','VERIFYING') OR
    "manualReviewStatus" = 'PENDING_REVIEW'
  );

CREATE OR REPLACE FUNCTION enforce_document_replacement_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prior_current boolean;
  current_successor_count integer;
  pending_successor_count integer;
  active_pending boolean;
  successful boolean;
BEGIN
  IF NEW."evidenceSchemaVersion" < 2 THEN RETURN NULL; END IF;
  active_pending := NEW."deletionStatus" <> 'DELETED' AND (
    NEW."uploadStatus" IN ('UPLOADED','VERIFYING') OR
    (NEW."uploadStatus"::text = 'TECHNICALLY_VALID' AND NEW."manualReviewStatus" = 'PENDING_REVIEW')
  );
  successful := NEW."deletionStatus" <> 'DELETED' AND (
    NEW."uploadStatus" = 'READY' OR
    (NEW."uploadStatus"::text = 'TECHNICALLY_VALID' AND NEW."manualReviewStatus" = 'APPROVED')
  );

  IF NEW."replacesDocumentId" IS NOT NULL THEN
    SELECT "isCurrent" INTO prior_current FROM "CustomerDocument" WHERE id = NEW."replacesDocumentId";
    IF active_pending THEN
      IF NEW."isCurrent" = true OR prior_current IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Committed pending replacement requires a current predecessor and must remain non-current';
      END IF;
    ELSIF successful AND NEW."isCurrent" = true THEN
      IF prior_current IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'Committed successful replacement must have a non-current predecessor';
      END IF;
    ELSIF (NEW."uploadStatus" IN ('REJECTED','FAILED') OR NEW."manualReviewStatus" IN ('REJECTED','REPLACEMENT_REQUIRED'))
      AND NEW."isCurrent" = true THEN
      RAISE EXCEPTION 'Terminal failed or rejected replacement cannot be current';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."isCurrent" = true AND NEW."isCurrent" = false AND NEW."deletionStatus" <> 'DELETED' THEN
    SELECT count(*) INTO current_successor_count FROM "CustomerDocument" successor
    WHERE successor."replacesDocumentId" = NEW.id AND successor."evidenceSchemaVersion" >= 2
      AND successor."isCurrent" = true AND successor."deletionStatus" <> 'DELETED'
      AND (
        successor."uploadStatus" = 'READY' OR
        (successor."uploadStatus"::text = 'TECHNICALLY_VALID' AND successor."manualReviewStatus" = 'APPROVED')
      );
    IF current_successor_count <> 1 THEN
      RAISE EXCEPTION 'Non-deleted current predecessor requires exactly one successful current successor';
    END IF;
  END IF;

  IF NEW."isCurrent" = false AND NEW."deletionStatus" <> 'DELETED' THEN
    SELECT count(*) INTO pending_successor_count FROM "CustomerDocument" successor
    WHERE successor."replacesDocumentId" = NEW.id AND successor."evidenceSchemaVersion" >= 2
      AND successor."isCurrent" = false AND successor."deletionStatus" <> 'DELETED'
      AND (
        successor."uploadStatus" IN ('UPLOADED','VERIFYING') OR
        (successor."uploadStatus"::text = 'TECHNICALLY_VALID' AND successor."manualReviewStatus" = 'PENDING_REVIEW')
      );
    IF pending_successor_count > 0 THEN
      RAISE EXCEPTION 'Pending replacement cannot commit with a non-current predecessor';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Idempotent restricted capability data. No compatibility or user assignment is
-- created here.
INSERT INTO "Capability" (id, key, description) VALUES
  ('capability-documents-review', 'documents.review', 'Make an authorized manual private-document review decision.'),
  ('capability-documents-request-replacement', 'documents.request-replacement', 'Request an authorized replacement for a private document.'),
  ('capability-documents-security-manage', 'documents.security.manage', 'Manage restricted private-document role assignments.'),
  ('capability-documents-incident-view', 'documents.incident.view', 'View sanitized private-document security incidents.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO "RoleCapability" ("accessRoleId", "capabilityId")
SELECT role.id, capability.id
FROM "AccessRole" role
JOIN "Capability" capability ON
  (role.key = 'DOCUMENT_REVIEWER' AND capability.key IN ('documents.review','documents.request-replacement'))
ON CONFLICT ("accessRoleId", "capabilityId") DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "RoleCapability" mapping
    JOIN "AccessRole" role ON role.id = mapping."accessRoleId"
    JOIN "Capability" capability ON capability.id = mapping."capabilityId"
    WHERE role.key = 'ADMIN_COMPAT' AND capability.key IN (
      'documents.review','documents.request-replacement',
      'documents.security.manage','documents.incident.view'
    )
  ) THEN
    RAISE EXCEPTION 'ADMIN_COMPAT must not receive manual document-review capabilities';
  END IF;
END;
$$;
