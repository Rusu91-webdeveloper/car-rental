-- Phase 8D replacement correction: a clean predecessor remains current while its
-- replacement is UPLOADED/VERIFYING. Promotion is committed atomically.
-- No applied Phase 8C migration is modified.

DO $$
DECLARE duplicate_predecessors text;
BEGIN
  SELECT string_agg(duplicate."replacesDocumentId", ', ' ORDER BY duplicate."replacesDocumentId")
    INTO duplicate_predecessors
  FROM (
    SELECT "replacesDocumentId"
    FROM "CustomerDocument"
    WHERE "evidenceSchemaVersion" >= 2
      AND "replacesDocumentId" IS NOT NULL
      AND "isCurrent" = false
      AND "uploadStatus" IN ('UPLOADED', 'VERIFYING')
      AND "deletionStatus" <> 'DELETED'
    GROUP BY "replacesDocumentId"
    HAVING count(*) > 1
  ) duplicate;

  IF duplicate_predecessors IS NOT NULL THEN
    RAISE EXCEPTION 'Multiple active pending replacements require manual review for predecessor(s): %', duplicate_predecessors;
  END IF;
END;
$$;

-- The old trigger required pending predecessors to be non-current. Because no Phase 8
-- runtime existed before this migration, such rows are unexpected. Fail rather than
-- silently reinterpret or choose evidence.
DO $$
DECLARE inconsistent_predecessors text;
BEGIN
  SELECT string_agg(replacement.id, ', ' ORDER BY replacement.id)
    INTO inconsistent_predecessors
  FROM "CustomerDocument" replacement
  LEFT JOIN "CustomerDocument" predecessor ON predecessor.id = replacement."replacesDocumentId"
  WHERE replacement."evidenceSchemaVersion" >= 2
    AND replacement."replacesDocumentId" IS NOT NULL
    AND replacement."isCurrent" = false
    AND replacement."uploadStatus" IN ('UPLOADED', 'VERIFYING')
    AND replacement."deletionStatus" <> 'DELETED'
    AND (predecessor.id IS NULL OR predecessor."isCurrent" = false);

  IF inconsistent_predecessors IS NOT NULL THEN
    RAISE EXCEPTION 'Pending replacement predecessor state requires manual review for document(s): %', inconsistent_predecessors;
  END IF;
END;
$$;

CREATE UNIQUE INDEX "CustomerDocument_one_pending_replacement_key"
ON "CustomerDocument" ("replacesDocumentId")
WHERE "evidenceSchemaVersion" >= 2
  AND "replacesDocumentId" IS NOT NULL
  AND "isCurrent" = false
  AND "uploadStatus" IN ('UPLOADED', 'VERIFYING')
  AND "deletionStatus" <> 'DELETED';

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
      prior."isCurrent" = true AND NEW."isCurrent" = false AND
      NEW."uploadStatus" IN ('UPLOADED', 'VERIFYING') AND NEW."deletionStatus" <> 'DELETED'
    ) THEN
      RAISE EXCEPTION 'New replacement must be active pending while its predecessor remains current';
    END IF;

    IF prior."isCurrent" = true AND (
      NEW."isCurrent" = true OR NEW."uploadStatus" NOT IN ('UPLOADED', 'VERIFYING', 'REJECTED', 'FAILED')
    ) THEN
      RAISE EXCEPTION 'Current predecessor permits only a non-current pending or terminal-failed replacement';
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

CREATE OR REPLACE FUNCTION enforce_document_replacement_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prior_current boolean;
  current_successor_count integer;
  pending_successor_count integer;
BEGIN
  IF NEW."evidenceSchemaVersion" < 2 THEN RETURN NULL; END IF;

  IF NEW."replacesDocumentId" IS NOT NULL THEN
    SELECT "isCurrent" INTO prior_current FROM "CustomerDocument" WHERE id = NEW."replacesDocumentId";

    IF NEW."deletionStatus" <> 'DELETED' AND NEW."uploadStatus" IN ('UPLOADED', 'VERIFYING') THEN
      IF NEW."isCurrent" = true OR prior_current IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Committed pending replacement requires a current predecessor and must remain non-current';
      END IF;
    ELSIF NEW."deletionStatus" <> 'DELETED' AND NEW."uploadStatus" = 'READY' THEN
      IF NEW."isCurrent" = false OR prior_current IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'Committed READY replacement must be current with a non-current predecessor';
      END IF;
    ELSIF NEW."uploadStatus" IN ('REJECTED', 'FAILED') AND NEW."isCurrent" = true THEN
      RAISE EXCEPTION 'Terminal failed replacement cannot be current';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."isCurrent" = true AND NEW."isCurrent" = false AND NEW."deletionStatus" <> 'DELETED' THEN
    SELECT count(*) INTO current_successor_count
    FROM "CustomerDocument" successor
    WHERE successor."replacesDocumentId" = NEW.id
      AND successor."evidenceSchemaVersion" >= 2
      AND successor."uploadStatus" = 'READY'
      AND successor."isCurrent" = true
      AND successor."deletionStatus" <> 'DELETED';
    IF current_successor_count <> 1 THEN
      RAISE EXCEPTION 'Non-deleted current predecessor requires exactly one promoted READY successor';
    END IF;
  END IF;

  IF NEW."isCurrent" = false AND NEW."deletionStatus" <> 'DELETED' THEN
    SELECT count(*) INTO pending_successor_count
    FROM "CustomerDocument" successor
    WHERE successor."replacesDocumentId" = NEW.id
      AND successor."evidenceSchemaVersion" >= 2
      AND successor."uploadStatus" IN ('UPLOADED', 'VERIFYING')
      AND successor."deletionStatus" <> 'DELETED';
    IF pending_successor_count > 0 THEN
      RAISE EXCEPTION 'Pending replacement cannot commit with a non-current predecessor';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "CustomerDocument_replacement_commit"
AFTER INSERT OR UPDATE OF "isCurrent", "uploadStatus", "deletionStatus", "replacesDocumentId"
ON "CustomerDocument"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_document_replacement_commit();
