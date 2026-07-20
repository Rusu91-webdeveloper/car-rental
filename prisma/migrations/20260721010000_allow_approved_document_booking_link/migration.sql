-- Booking finalization is the only point at which an approved upload can be
-- associated with its newly-created Booking. The association is provenance,
-- not a mutation of the immutable technical or manual-review evidence.
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

  IF TG_OP = 'UPDATE' AND OLD."bookingId" IS DISTINCT FROM NEW."bookingId" AND NOT (
    OLD."bookingId" IS NULL AND NEW."bookingId" IS NOT NULL AND NEW."manualReviewStatus" = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'CustomerDocument Booking provenance is immutable once assigned';
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
      'bookingId','isCurrent','retentionUntil','retentionBasis','retentionBasisAt','retentionPolicyDaysSnapshot',
      'hardRetentionDaysSnapshot','deletionEligibleAt','legalHold','deletionStatus','deletedAt',
      'deletionReason','quarantineStatus','releasedFromQuarantineAt','manualReviewStatus',
      'reviewRevision','reviewedById','reviewedAt','reviewReasonCode','safeReviewerNote','updatedAt'
    ]) <> (to_jsonb(OLD) - ARRAY[
      'bookingId','isCurrent','retentionUntil','retentionBasis','retentionBasisAt','retentionPolicyDaysSnapshot',
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
      IF (to_jsonb(NEW) - ARRAY[
        'bookingId','isCurrent','retentionUntil','retentionBasis','retentionBasisAt','retentionPolicyDaysSnapshot',
        'hardRetentionDaysSnapshot','deletionEligibleAt','legalHold','deletionStatus','deletedAt',
        'deletionReason','quarantineStatus','updatedAt'
      ]) <> (to_jsonb(OLD) - ARRAY[
        'bookingId','isCurrent','retentionUntil','retentionBasis','retentionBasisAt','retentionPolicyDaysSnapshot',
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
