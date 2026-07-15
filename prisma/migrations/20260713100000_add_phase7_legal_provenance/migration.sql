-- Phase 7 additive legal publication, policy-translation, and acceptance provenance.
-- Historical rows remain compatible; no publication authority or acceptance is fabricated.

ALTER TYPE "LegalAcceptanceRequirement" ADD VALUE IF NOT EXISTS 'DISABLED';

CREATE TYPE "LegalContentPresentation" AS ENUM ('INLINE', 'DIALOG');

ALTER TABLE "LegalDocumentVersion"
  ADD COLUMN "primaryLocale" VARCHAR(10),
  ADD COLUMN "validationStatus" "ConfigurationValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
  ADD COLUMN "validationSnapshot" JSONB,
  ADD COLUMN "validatedById" TEXT,
  ADD COLUMN "validatedAt" TIMESTAMP(3);

ALTER TABLE "LegalDocumentTranslation"
  ADD COLUMN "validationStatus" "ConfigurationValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
  ADD COLUMN "validationSnapshot" JSONB;

ALTER TABLE "LegalAcceptanceConfigVersion"
  ADD COLUMN "bookingEnforcementEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requiredLocales" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "termsPresentation" "LegalContentPresentation" NOT NULL DEFAULT 'DIALOG',
  ADD COLUMN "privacyPresentation" "LegalContentPresentation" NOT NULL DEFAULT 'DIALOG',
  ADD COLUMN "showInConfirmation" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "LegalAcceptanceTranslation" (
  "id" TEXT NOT NULL,
  "legalAcceptanceConfigVersionId" TEXT NOT NULL,
  "locale" VARCHAR(10) NOT NULL,
  "termsCheckboxLabel" TEXT,
  "termsLinkLabel" TEXT NOT NULL,
  "privacyCheckboxLabel" TEXT,
  "privacyLinkLabel" TEXT NOT NULL,
  CONSTRAINT "LegalAcceptanceTranslation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BookingLegalAcceptance"
  ADD COLUMN "configurationReleaseId" TEXT,
  ADD COLUMN "legalAcceptanceConfigVersionId" TEXT;

CREATE INDEX "LegalDocumentVersion_validationStatus_idx" ON "LegalDocumentVersion"("validationStatus");
CREATE INDEX "LegalDocumentVersion_primaryLocale_idx" ON "LegalDocumentVersion"("primaryLocale");
CREATE INDEX "LegalDocumentVersion_validatedById_validatedAt_idx" ON "LegalDocumentVersion"("validatedById", "validatedAt");
CREATE UNIQUE INDEX "LegalAcceptanceTranslation_legalAcceptanceConfigVersionId_l_key"
  ON "LegalAcceptanceTranslation"("legalAcceptanceConfigVersionId", "locale");
CREATE INDEX "LegalAcceptanceTranslation_locale_idx" ON "LegalAcceptanceTranslation"("locale");
CREATE INDEX "BookingLegalAcceptance_configurationReleaseId_idx" ON "BookingLegalAcceptance"("configurationReleaseId");
CREATE INDEX "BookingLegalAcceptance_legalAcceptanceConfigVersionId_idx" ON "BookingLegalAcceptance"("legalAcceptanceConfigVersionId");

ALTER TABLE "LegalDocumentVersion"
  ADD CONSTRAINT "LegalDocumentVersion_validatedById_fkey"
  FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LegalAcceptanceTranslation"
  ADD CONSTRAINT "LegalAcceptanceTranslation_legalAcceptanceConfigVersionId_fkey"
  FOREIGN KEY ("legalAcceptanceConfigVersionId") REFERENCES "LegalAcceptanceConfigVersion"("configurationVersionId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LegalAcceptanceTranslation_plain_locale_check"
  CHECK ("locale" ~ '^[a-z]{2}(-[A-Z]{2})?$');

ALTER TABLE "BookingLegalAcceptance"
  ADD CONSTRAINT "BookingLegalAcceptance_configurationReleaseId_fkey"
  FOREIGN KEY ("configurationReleaseId") REFERENCES "BusinessConfigurationRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BookingLegalAcceptance_legalAcceptanceConfigVersionId_fkey"
  FOREIGN KEY ("legalAcceptanceConfigVersionId") REFERENCES "LegalAcceptanceConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BookingLegalAcceptance_accepted_check" CHECK (accepted = true) NOT VALID;

ALTER TABLE "LegalDocumentVersion"
  ADD CONSTRAINT "LegalDocumentVersion_primary_locale_format_check"
  CHECK ("primaryLocale" IS NULL OR "primaryLocale" ~ '^[a-z]{2}(-[A-Z]{2})?$') NOT VALID;

-- Backfill acceptance provenance only where every immutable relationship agrees.
ALTER TABLE "BookingLegalAcceptance" DISABLE TRIGGER "BookingLegalAcceptance_append_only";
UPDATE "BookingLegalAcceptance" acceptance
SET "configurationReleaseId" = pricing."configurationReleaseId",
    "legalAcceptanceConfigVersionId" = release."legalAcceptanceConfigVersionId"
FROM "BookingPricingSnapshot" pricing
JOIN "BusinessConfigurationRelease" release ON release.id = pricing."configurationReleaseId"
JOIN "LegalAcceptanceConfigVersion" policy ON policy."configurationVersionId" = release."legalAcceptanceConfigVersionId"
JOIN "LegalDocumentTranslation" translation ON true
JOIN "LegalDocumentVersion" document ON document.id = translation."legalDocumentVersionId"
WHERE pricing."bookingId" = acceptance."bookingId"
  AND translation.id = acceptance."legalDocumentTranslationId"
  AND pricing."compatibilityMode" = false
  AND pricing."configurationReleaseId" IS NOT NULL
  AND acceptance."documentType" = document.type
  AND acceptance."documentVersionNumber" = document."versionNumber"
  AND acceptance.locale = translation.locale
  AND acceptance."contentHash" = translation."contentHash"
  AND (
    (acceptance."documentType" = 'RENTAL_TERMS' AND policy."termsDocumentVersionId" = document.id) OR
    (acceptance."documentType" = 'PRIVACY_NOTICE' AND policy."privacyDocumentVersionId" = document.id)
  );
ALTER TABLE "BookingLegalAcceptance" ENABLE TRIGGER "BookingLegalAcceptance_append_only";

-- A newly published version must carry complete validation provenance. Historical
-- publications are not rewritten and remain valid.
CREATE OR REPLACE FUNCTION enforce_new_legal_publication()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'PUBLISHED' AND OLD.status = 'DRAFT' THEN
    IF NEW."primaryLocale" IS NULL OR NEW."validationStatus" NOT IN ('VALID', 'WARNING') OR
       NEW."validatedById" IS NULL OR NEW."validatedAt" IS NULL OR
       NEW."publishedById" IS NULL OR NEW."publishedAt" IS NULL OR
       NEW."manifestHash" IS NULL OR NEW."manifestHash" !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'New legal publication requires primary locale, validation, publication, and hash provenance';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "LegalDocumentTranslation" translation
      WHERE translation."legalDocumentVersionId" = NEW.id
        AND translation.locale = NEW."primaryLocale"
    ) THEN
      RAISE EXCEPTION 'Legal publication primary locale has no translation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "LegalDocumentTranslation" translation
      WHERE translation."legalDocumentVersionId" = NEW.id
        AND (
          translation."validationStatus" NOT IN ('VALID', 'WARNING') OR
          translation.title = '' OR translation."canonicalContent" = '' OR
          translation."contentHash" !~ '^[a-f0-9]{64}$'
        )
    ) THEN
      RAISE EXCEPTION 'Every published legal translation must be valid and hashed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "LegalDocumentVersion_publication_provenance"
BEFORE UPDATE OF status ON "LegalDocumentVersion"
FOR EACH ROW EXECUTE FUNCTION enforce_new_legal_publication();

CREATE OR REPLACE FUNCTION prevent_archiving_active_legal_publication()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'ARCHIVED' AND EXISTS (
    SELECT 1
    FROM "BusinessConfigurationRelease" release
    JOIN "LegalAcceptanceConfigVersion" policy
      ON policy."configurationVersionId" = release."legalAcceptanceConfigVersionId"
    WHERE release.status = 'ACTIVE'
      AND (policy."termsDocumentVersionId" = OLD.id OR policy."privacyDocumentVersionId" = OLD.id)
  ) THEN
    RAISE EXCEPTION 'Legal publication used by the active release cannot be archived';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "LegalDocumentVersion_active_archive_guard"
BEFORE UPDATE OF status ON "LegalDocumentVersion"
FOR EACH ROW EXECUTE FUNCTION prevent_archiving_active_legal_publication();

-- Phase 7 legal policy consistency is deferred so a config and all localized labels
-- can be created in one transaction.
CREATE OR REPLACE FUNCTION enforce_legal_acceptance_config_consistency()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status "ConfigurationVersionStatus";
  required_locale text;
  terms_mode "LegalAcceptanceRequirement";
  privacy_mode "LegalAcceptanceRequirement";
  terms_id text;
  privacy_id text;
BEGIN
  SELECT status INTO parent_status
  FROM "ConfigurationVersion"
  WHERE id = NEW."configurationVersionId";
  IF parent_status NOT IN ('VALIDATED', 'RELEASED') THEN
    RETURN NEW;
  END IF;
  IF NOT NEW."bookingEnforcementEnabled" THEN
    RETURN NEW;
  END IF;
  IF cardinality(NEW."requiredLocales") = 0 OR
     cardinality(NEW."requiredLocales") <> (SELECT count(DISTINCT locale) FROM unnest(NEW."requiredLocales") locale) THEN
    RAISE EXCEPTION 'Enforced legal acceptance requires unique locales';
  END IF;
  IF NEW."termsAcceptance" = 'DISABLED' AND NEW."privacyAcknowledgment" = 'DISABLED' THEN
    RAISE EXCEPTION 'Enforced legal acceptance requires at least one applicable document';
  END IF;

  terms_mode := NEW."termsAcceptance";
  privacy_mode := NEW."privacyAcknowledgment";
  terms_id := NEW."termsDocumentVersionId";
  privacy_id := NEW."privacyDocumentVersionId";

  IF (SELECT status FROM "LegalDocumentVersion" WHERE id = terms_id AND type = 'RENTAL_TERMS') IS DISTINCT FROM 'PUBLISHED' OR
     (SELECT status FROM "LegalDocumentVersion" WHERE id = privacy_id AND type = 'PRIVACY_NOTICE') IS DISTINCT FROM 'PUBLISHED' THEN
    RAISE EXCEPTION 'Enforced legal acceptance requires exact published documents';
  END IF;

  FOREACH required_locale IN ARRAY NEW."requiredLocales" LOOP
    IF required_locale !~ '^[a-z]{2}(-[A-Z]{2})?$' THEN
      RAISE EXCEPTION 'Required legal locale is not normalized';
    END IF;
    IF (terms_mode <> 'DISABLED' AND NOT EXISTS (
      SELECT 1 FROM "LegalDocumentTranslation" WHERE "legalDocumentVersionId" = terms_id AND locale = required_locale
    )) OR (privacy_mode <> 'DISABLED' AND NOT EXISTS (
      SELECT 1 FROM "LegalDocumentTranslation" WHERE "legalDocumentVersionId" = privacy_id AND locale = required_locale
    )) THEN
      RAISE EXCEPTION 'Required legal publication translation is missing';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "LegalAcceptanceTranslation" labels
      WHERE labels."legalAcceptanceConfigVersionId" = NEW."configurationVersionId"
        AND labels.locale = required_locale
        AND length(trim(labels."termsLinkLabel")) > 0
        AND length(trim(labels."privacyLinkLabel")) > 0
        AND (terms_mode <> 'REQUIRED' OR length(trim(labels."termsCheckboxLabel")) > 0)
        AND (privacy_mode <> 'REQUIRED' OR length(trim(labels."privacyCheckboxLabel")) > 0)
    ) THEN
      RAISE EXCEPTION 'Required legal acceptance labels are missing';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "LegalAcceptanceConfigVersion_phase7_consistency"
AFTER INSERT OR UPDATE ON "LegalAcceptanceConfigVersion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_legal_acceptance_config_consistency();

-- Constraint scheduling uses true no-op updates. Preserve immutable lifecycle
-- semantics while permitting those updates to reach deferred consistency checks.
CREATE OR REPLACE FUNCTION protect_configuration_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' AND OLD.status IN ('RELEASED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'Released configuration version % cannot be deleted', OLD.id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('RELEASED', 'ARCHIVED') THEN
    IF NOT (OLD.status = 'RELEASED' AND NEW.status = 'ARCHIVED') OR
       (to_jsonb(NEW) - ARRAY['status','archivedAt','updatedAt','updatedById']) <>
       (to_jsonb(OLD) - ARRAY['status','archivedAt','updatedAt','updatedById']) THEN
      RAISE EXCEPTION 'Released configuration version % is immutable', OLD.id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION protect_configuration_payload()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  version_id text;
  version_status "ConfigurationVersionStatus";
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  version_id := COALESCE(to_jsonb(OLD)->>TG_ARGV[0], to_jsonb(NEW)->>TG_ARGV[0]);
  SELECT status INTO version_status FROM "ConfigurationVersion" WHERE id = version_id;
  IF version_status IN ('RELEASED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'Payload for released configuration version % is immutable', version_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Child changes schedule the parent checks and use the existing released-payload
-- protection once a configuration version is activated.
CREATE OR REPLACE FUNCTION schedule_legal_acceptance_config_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_id text;
BEGIN
  version_id := COALESCE(NEW."legalAcceptanceConfigVersionId", OLD."legalAcceptanceConfigVersionId");
  UPDATE "LegalAcceptanceConfigVersion"
  SET "configurationVersionId" = "configurationVersionId"
  WHERE "configurationVersionId" = version_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "LegalAcceptanceTranslation_schedule_check"
AFTER INSERT OR UPDATE OR DELETE ON "LegalAcceptanceTranslation"
FOR EACH ROW EXECUTE FUNCTION schedule_legal_acceptance_config_check();

-- Promoting a draft schedules the same deferred policy check. Draft payloads can
-- therefore remain editable while invalid validated/released payloads are rejected.
CREATE OR REPLACE FUNCTION schedule_legal_acceptance_config_check_from_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.domain = 'LEGAL_ACCEPTANCE' AND NEW.status IN ('VALIDATED', 'RELEASED') THEN
    UPDATE "LegalAcceptanceConfigVersion"
    SET "configurationVersionId" = "configurationVersionId"
    WHERE "configurationVersionId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ConfigurationVersion_schedule_phase7_legal_check"
AFTER UPDATE OF status ON "ConfigurationVersion"
FOR EACH ROW EXECUTE FUNCTION schedule_legal_acceptance_config_check_from_version();

CREATE TRIGGER "LegalAcceptanceTranslation_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "LegalAcceptanceTranslation"
FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('legalAcceptanceConfigVersionId');

-- Active releases with Phase 7 enforcement must support every booking locale and a
-- compatible legal workflow step. Pre-Phase 7 releases remain unaffected.
CREATE OR REPLACE FUNCTION enforce_active_release_phase7_legal()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  policy "LegalAcceptanceConfigVersion"%ROWTYPE;
  supported_locales text[];
  legal_step "BookingStepMode";
BEGIN
  IF NEW.status <> 'ACTIVE' THEN RETURN NEW; END IF;
  SELECT * INTO policy FROM "LegalAcceptanceConfigVersion"
  WHERE "configurationVersionId" = NEW."legalAcceptanceConfigVersionId";
  IF NOT policy."bookingEnforcementEnabled" THEN RETURN NEW; END IF;

  SELECT "supportedLocales" INTO supported_locales FROM "GeneralRentalConfigVersion"
  WHERE "configurationVersionId" = NEW."generalRentalConfigVersionId";
  IF EXISTS (SELECT 1 FROM unnest(supported_locales) locale WHERE NOT (locale = ANY(policy."requiredLocales"))) THEN
    RAISE EXCEPTION 'Active release legal policy must cover every supported booking locale';
  END IF;
  SELECT mode INTO legal_step FROM "BookingStepRule"
  WHERE "bookingWorkflowConfigVersionId" = NEW."bookingWorkflowConfigVersionId" AND step = 'LEGAL_ACCEPTANCE';
  IF (policy."termsAcceptance" = 'REQUIRED' OR policy."privacyAcknowledgment" = 'REQUIRED') AND legal_step <> 'REQUIRED' THEN
    RAISE EXCEPTION 'Required legal acknowledgement requires a required legal workflow step';
  END IF;
  IF policy."termsAcceptance" <> 'REQUIRED' AND policy."privacyAcknowledgment" <> 'REQUIRED' AND legal_step = 'HIDDEN' THEN
    RAISE EXCEPTION 'Enabled legal presentation requires a visible legal workflow step';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "BusinessConfigurationRelease_phase7_legal"
AFTER INSERT OR UPDATE OF status, "legalAcceptanceConfigVersionId", "bookingWorkflowConfigVersionId" ON "BusinessConfigurationRelease"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_active_release_phase7_legal();

-- Every newly inserted acceptance is exact, affirmative, and tied to the active
-- release/config/document/translation shown to the customer.
CREATE OR REPLACE FUNCTION enforce_booking_legal_acceptance_consistency()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pricing_release_id text;
  pricing_compatibility boolean;
  release_policy_id text;
  booking_user_id text;
  policy "LegalAcceptanceConfigVersion"%ROWTYPE;
  document_id text;
  document_type "LegalDocumentType";
  document_version integer;
  document_status "LegalPublicationStatus";
  translation_locale text;
  translation_hash text;
  canonical_content text;
  required_mode "LegalAcceptanceRequirement";
BEGIN
  IF NOT NEW.accepted THEN RAISE EXCEPTION 'Stored legal acceptance must be affirmative'; END IF;
  IF NEW.source <> 'CUSTOMER_CHECKBOX' THEN RAISE EXCEPTION 'New booking legal acceptance requires explicit customer checkbox evidence'; END IF;
  IF NEW."configurationReleaseId" IS NULL OR NEW."legalAcceptanceConfigVersionId" IS NULL THEN
    RAISE EXCEPTION 'Legal acceptance requires release and configuration provenance';
  END IF;

  SELECT pricing."configurationReleaseId", pricing."compatibilityMode", booking."userId"
  INTO pricing_release_id, pricing_compatibility, booking_user_id
  FROM "BookingPricingSnapshot" pricing JOIN "Booking" booking ON booking.id = pricing."bookingId"
  WHERE pricing."bookingId" = NEW."bookingId";
  IF pricing_compatibility OR pricing_release_id IS NULL OR pricing_release_id <> NEW."configurationReleaseId" THEN
    RAISE EXCEPTION 'Legal acceptance booking release provenance is inconsistent';
  END IF;

  SELECT "legalAcceptanceConfigVersionId" INTO release_policy_id FROM "BusinessConfigurationRelease"
  WHERE id = NEW."configurationReleaseId";
  IF release_policy_id <> NEW."legalAcceptanceConfigVersionId" THEN
    RAISE EXCEPTION 'Legal acceptance configuration does not match release';
  END IF;
  SELECT * INTO policy FROM "LegalAcceptanceConfigVersion"
  WHERE "configurationVersionId" = NEW."legalAcceptanceConfigVersionId";
  IF NOT policy."bookingEnforcementEnabled" OR NOT (NEW.locale = ANY(policy."requiredLocales")) THEN
    RAISE EXCEPTION 'Legal acceptance policy is not enforced for locale';
  END IF;

  SELECT document.id, document.type, document."versionNumber", document.status,
         translation.locale, translation."contentHash", translation."canonicalContent"
  INTO document_id, document_type, document_version, document_status,
       translation_locale, translation_hash, canonical_content
  FROM "LegalDocumentTranslation" translation
  JOIN "LegalDocumentVersion" document ON document.id = translation."legalDocumentVersionId"
  WHERE translation.id = NEW."legalDocumentTranslationId";

  required_mode := CASE NEW."documentType"
    WHEN 'RENTAL_TERMS' THEN policy."termsAcceptance"
    WHEN 'PRIVACY_NOTICE' THEN policy."privacyAcknowledgment"
  END;
  IF required_mode <> 'REQUIRED' OR document_status <> 'PUBLISHED' OR
     document_type <> NEW."documentType" OR document_version <> NEW."documentVersionNumber" OR
     translation_locale <> NEW.locale OR translation_hash <> NEW."contentHash" OR
     (NEW."documentType" = 'RENTAL_TERMS' AND policy."termsDocumentVersionId" <> document_id) OR
     (NEW."documentType" = 'PRIVACY_NOTICE' AND policy."privacyDocumentVersionId" <> document_id) THEN
    RAISE EXCEPTION 'Legal acceptance publication evidence is inconsistent';
  END IF;
  IF NEW."customerUserId" IS DISTINCT FROM booking_user_id THEN
    RAISE EXCEPTION 'Legal acceptance customer does not match booking customer';
  END IF;
  IF policy."retainContentSnapshot" AND NEW."contentSnapshot" IS DISTINCT FROM canonical_content THEN
    RAISE EXCEPTION 'Legal acceptance content snapshot is inconsistent';
  END IF;
  IF NOT policy."retainContentSnapshot" AND NEW."contentSnapshot" IS NOT NULL THEN
    RAISE EXCEPTION 'Legal acceptance content snapshot retention is disabled';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "BookingLegalAcceptance_phase7_consistency"
AFTER INSERT ON "BookingLegalAcceptance"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_booking_legal_acceptance_consistency();
