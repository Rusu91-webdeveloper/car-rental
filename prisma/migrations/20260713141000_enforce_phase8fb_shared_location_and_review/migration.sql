-- Phase 8F-B follow-up: preserve the product's existing single-location
-- contract and require manual approval before an application can finalize.

ALTER TABLE "BookingApplication"
  ADD CONSTRAINT "BookingApplication_shared_location_check"
  CHECK ("pickupLocation" = "returnLocation") NOT VALID;

ALTER TABLE "BookingApplication"
  VALIDATE CONSTRAINT "BookingApplication_shared_location_check";

CREATE OR REPLACE FUNCTION assert_booking_application_manual_review(application_id text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  app "BookingApplication"%ROWTYPE;
  session_id text;
  identity_choice "IdentityDocumentChoice";
BEGIN
  SELECT * INTO app FROM "BookingApplication" WHERE id = application_id;
  SELECT session.id INTO session_id FROM "DocumentUploadSession" session
    WHERE session."bookingApplicationId" = application_id;
  SELECT "identityDocumentChoice" INTO identity_choice
    FROM "DocumentPolicyConfigVersion"
    WHERE "configurationVersionId" = app."documentPolicyConfigVersionId";

  IF EXISTS (
    SELECT 1
    FROM "DocumentRequirementRule" rule
    JOIN "DocumentTypeDefinition" definition ON definition.id = rule."documentTypeId"
    CROSS JOIN LATERAL generate_series(1, rule."fileCount") slot_number
    CROSS JOIN LATERAL unnest(CASE WHEN rule.sides = 'FRONT_AND_BACK'
      THEN ARRAY['FRONT', 'BACK']::"DocumentSide"[]
      ELSE ARRAY['SINGLE']::"DocumentSide"[] END) side_value
    WHERE rule."documentPolicyConfigVersionId" = app."documentPolicyConfigVersionId"
      AND rule.mode = 'REQUIRED'
      AND NOT (identity_choice = 'EITHER_IDENTITY_CARD_OR_PASSPORT'
        AND definition.key IN ('IDENTITY_CARD', 'PASSPORT'))
      AND NOT EXISTS (
        SELECT 1 FROM "CustomerDocument" document
        WHERE document."uploadSessionId" = session_id
          AND document."documentTypeId" = rule."documentTypeId"
          AND document."slotNumber" = slot_number
          AND document.side = side_value
          AND document."customerUserId" = app."customerUserId"
          AND document."configurationReleaseId" = app."configurationReleaseId"
          AND document."documentPolicyConfigVersionId" = app."documentPolicyConfigVersionId"
          AND document."isCurrent" = true
          AND document."deletionStatus" = 'RETAINED'
          AND document."retentionUntil" > CURRENT_TIMESTAMP
          AND document."manualReviewStatus" = 'APPROVED'
      )
  ) THEN
    RAISE EXCEPTION 'Required customer document manual approval is incomplete';
  END IF;

  IF identity_choice = 'EITHER_IDENTITY_CARD_OR_PASSPORT' AND NOT EXISTS (
    SELECT 1 FROM "CustomerDocument" document
    JOIN "DocumentTypeDefinition" definition ON definition.id = document."documentTypeId"
    WHERE document."uploadSessionId" = session_id
      AND definition.key IN ('IDENTITY_CARD', 'PASSPORT')
      AND document."customerUserId" = app."customerUserId"
      AND document."configurationReleaseId" = app."configurationReleaseId"
      AND document."documentPolicyConfigVersionId" = app."documentPolicyConfigVersionId"
      AND document."isCurrent" = true
      AND document."deletionStatus" = 'RETAINED'
      AND document."retentionUntil" > CURRENT_TIMESTAMP
      AND document."manualReviewStatus" = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'Required identity document manual approval is incomplete';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_booking_application_manual_review()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('READY_TO_FINALIZE', 'FINALIZING') AND
     (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM assert_booking_application_manual_review(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "BookingApplication_manual_review_gate"
BEFORE INSERT OR UPDATE ON "BookingApplication"
FOR EACH ROW EXECUTE FUNCTION enforce_booking_application_manual_review();
