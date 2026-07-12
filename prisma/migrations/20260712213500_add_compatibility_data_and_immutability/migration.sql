-- Phase 2B migration 6/6: stable reference data, legacy ADMIN compatibility,
-- safe checks, activation integrity, partial uniqueness, and approved immutability triggers.
-- The fleet-rate compatibility backfill is a separate idempotent script because it
-- requires representative legacy Cars and an existing active ADMIN actor.

-- Stable reference vocabulary. These keys mirror the Phase 1 TypeScript contracts.
INSERT INTO "DocumentTypeDefinition" ("id", "key", "name", "description", "isSystem", "isActive", "updatedAt")
VALUES
  ('document-type-identity-card', 'IDENTITY_CARD', 'Identity card', 'Government-issued identity card.', true, true, CURRENT_TIMESTAMP),
  ('document-type-passport', 'PASSPORT', 'Passport', 'Government-issued passport.', true, true, CURRENT_TIMESTAMP),
  ('document-type-driving-licence', 'DRIVING_LICENCE', 'Driving licence', 'Valid driving licence.', true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "ConfirmationSectionDefinition" ("id", "key", "name", "description", "isSystem", "isActive", "updatedAt")
VALUES
  ('confirmation-section-pricing', 'PRICING', 'Pricing', 'Pricing breakdown.', true, true, CURRENT_TIMESTAMP),
  ('confirmation-section-insurance', 'INSURANCE', 'Insurance', 'Insurance selection and price.', true, true, CURRENT_TIMESTAMP),
  ('confirmation-section-payment', 'PAYMENT', 'Payment', 'Payment method and instructions.', true, true, CURRENT_TIMESTAMP),
  ('confirmation-section-pickup-return', 'PICKUP_RETURN', 'Pickup and return', 'Pickup and return information.', true, true, CURRENT_TIMESTAMP),
  ('confirmation-section-customer-details', 'CUSTOMER_DETAILS', 'Customer details', 'Allowlisted customer contact details.', true, true, CURRENT_TIMESTAMP),
  ('confirmation-section-document-reminders', 'DOCUMENT_REMINDERS', 'Document reminders', 'Required document reminders.', true, true, CURRENT_TIMESTAMP),
  ('confirmation-section-legal-references', 'LEGAL_REFERENCES', 'Legal references', 'Terms and privacy references.', true, true, CURRENT_TIMESTAMP),
  ('confirmation-section-company-contact', 'COMPANY_CONTACT', 'Company contact', 'Company support details.', true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Capability" ("id", "key", "description")
VALUES
  ('capability-configuration-view', 'configuration.view', 'View Business Configuration.'),
  ('capability-configuration-edit', 'configuration.edit', 'Edit configuration drafts.'),
  ('capability-configuration-validate', 'configuration.validate', 'Validate configuration drafts.'),
  ('capability-configuration-activate', 'configuration.activate', 'Activate configuration releases.'),
  ('capability-pricing-manage', 'pricing.manage', 'Manage pricing policy and fleet rates.'),
  ('capability-legal-edit', 'legal.edit', 'Edit legal drafts.'),
  ('capability-legal-publish', 'legal.publish', 'Publish legal document versions.'),
  ('capability-documents-view', 'documents.view', 'View authorized private-document metadata/content.'),
  ('capability-documents-download', 'documents.download', 'Download authorized private documents.'),
  ('capability-documents-delete', 'documents.delete', 'Run authorized document deletion workflows.'),
  ('capability-payments-manage', 'payments.manage', 'Manage supported payment rules.'),
  ('capability-confirmations-manage', 'confirmations.manage', 'Manage confirmation content.'),
  ('capability-roles-manage', 'roles.manage', 'Manage access roles and capability mappings.'),
  ('capability-security-audit-view', 'security.audit.view', 'View security and access audit events.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AccessRole" ("id", "key", "name", "description", "status", "isSystem", "updatedAt")
VALUES ('access-role-admin-compat', 'ADMIN_COMPAT', 'Administrator compatibility', 'Mirrors existing ADMIN access until capability runtime cutover.', 'ACTIVE', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RoleCapability" ("accessRoleId", "capabilityId")
SELECT role.id, capability.id
FROM "AccessRole" role
CROSS JOIN "Capability" capability
WHERE role.key = 'ADMIN_COMPAT'
  AND capability.key IN (
    'configuration.view', 'configuration.edit', 'configuration.validate', 'configuration.activate',
    'pricing.manage', 'legal.edit', 'legal.publish', 'documents.view', 'documents.download',
    'documents.delete', 'payments.manage', 'confirmations.manage', 'roles.manage', 'security.audit.view'
  )
ON CONFLICT ("accessRoleId", "capabilityId") DO NOTHING;

INSERT INTO "UserAccessRole" ("userId", "accessRoleId")
SELECT user_record.id, role.id
FROM "User" user_record
CROSS JOIN "AccessRole" role
WHERE user_record.role = 'ADMIN'
  AND user_record."isActive" = true
  AND role.key = 'ADMIN_COMPAT'
ON CONFLICT ("userId", "accessRoleId") DO NOTHING;

-- Basic safe bounds. Hard document-retention limits remain deferred to legal approval.
ALTER TABLE "ConfigurationVersion"
  ADD CONSTRAINT "ConfigurationVersion_positive_version_check" CHECK ("versionNumber" > 0),
  ADD CONSTRAINT "ConfigurationVersion_positive_schema_revision_check" CHECK ("schemaVersion" > 0 AND "revision" > 0);

ALTER TABLE "BusinessConfigurationRelease"
  ADD CONSTRAINT "BusinessConfigurationRelease_positive_number_revision_check" CHECK ("releaseNumber" > 0 AND "revision" > 0);

ALTER TABLE "PricingBillingConfigVersion"
  ADD CONSTRAINT "PricingBillingConfig_bounds_check" CHECK (
    "gracePeriodMinutes" BETWEEN 0 AND 720 AND
    "minimumRentalMinutes" BETWEEN 1 AND 525600 AND
    "minimumChargeDays" BETWEEN 1 AND 365 AND
    "taxRateBps" BETWEEN 0 AND 10000
  );

ALTER TABLE "InsuranceConfigVersion"
  ADD CONSTRAINT "InsuranceConfig_price_check" CHECK (
    ("requirementMode" = 'DISABLED' AND "pricePerDay" >= 0) OR
    ("requirementMode" <> 'DISABLED' AND "pricePerDay" > 0)
  );

ALTER TABLE "CustomerDriverConfigVersion"
  ADD CONSTRAINT "CustomerDriverConfig_bounds_check" CHECK (
    "minimumDriverAge" BETWEEN 18 AND 99 AND
    ("maximumDriverAge" IS NULL OR "maximumDriverAge" BETWEEN "minimumDriverAge" AND 120) AND
    "minimumLicenceHeldMonths" BETWEEN 0 AND 1200
  );

ALTER TABLE "DocumentRequirementRule"
  ADD CONSTRAINT "DocumentRequirementRule_file_count_check" CHECK ("fileCount" BETWEEN 1 AND 2);

ALTER TABLE "PaymentConfigVersion"
  ADD CONSTRAINT "PaymentConfig_deposit_check" CHECK (
    ("depositType" = 'NONE' AND "depositValue" = 0) OR
    ("depositType" = 'FIXED_AMOUNT' AND "depositValue" > 0) OR
    ("depositType" = 'PERCENTAGE_BPS' AND "depositValue" BETWEEN 1 AND 10000)
  );

ALTER TABLE "FleetRateSet"
  ADD CONSTRAINT "FleetRateSet_positive_version_check" CHECK ("versionNumber" > 0 AND "schemaVersion" > 0 AND "revision" > 0);

ALTER TABLE "VehicleRentalRate"
  ADD CONSTRAINT "VehicleRentalRate_values_check" CHECK (
    "dailyRate" > 0 AND
    (NOT "weeklyRateEnabled" OR ("weeklyRate" IS NOT NULL AND "weeklyRate" > 0)) AND
    (NOT "monthlyRateEnabled" OR ("monthlyRate" IS NOT NULL AND "monthlyRate" > 0))
  );

ALTER TABLE "CustomerDocument"
  ADD CONSTRAINT "CustomerDocument_metadata_check" CHECK (
    "sequence" > 0 AND "sizeBytes" > 0 AND char_length("checksumSha256") = 64
  );

-- Prisma cannot express a partial unique index.
CREATE UNIQUE INDEX "BusinessConfigurationRelease_one_active_idx"
  ON "BusinessConfigurationRelease" ("status")
  WHERE "status" = 'ACTIVE';

-- A metadata row must have exactly one payload and that payload must match its domain.
CREATE OR REPLACE FUNCTION enforce_configuration_payload_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  matching_count integer := 0;
  total_count integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "ConfigurationVersion" WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;
  total_count :=
    (SELECT count(*) FROM "GeneralRentalConfigVersion" WHERE "configurationVersionId" = NEW.id) +
    (SELECT count(*) FROM "PricingBillingConfigVersion" WHERE "configurationVersionId" = NEW.id) +
    (SELECT count(*) FROM "InsuranceConfigVersion" WHERE "configurationVersionId" = NEW.id) +
    (SELECT count(*) FROM "CustomerDriverConfigVersion" WHERE "configurationVersionId" = NEW.id) +
    (SELECT count(*) FROM "BookingWorkflowConfigVersion" WHERE "configurationVersionId" = NEW.id) +
    (SELECT count(*) FROM "DocumentPolicyConfigVersion" WHERE "configurationVersionId" = NEW.id) +
    (SELECT count(*) FROM "PaymentConfigVersion" WHERE "configurationVersionId" = NEW.id) +
    (SELECT count(*) FROM "ConfirmationConfigVersion" WHERE "configurationVersionId" = NEW.id) +
    (SELECT count(*) FROM "LegalAcceptanceConfigVersion" WHERE "configurationVersionId" = NEW.id);

  matching_count := CASE NEW.domain
    WHEN 'GENERAL_RENTAL' THEN (SELECT count(*) FROM "GeneralRentalConfigVersion" WHERE "configurationVersionId" = NEW.id)
    WHEN 'PRICING_BILLING' THEN (SELECT count(*) FROM "PricingBillingConfigVersion" WHERE "configurationVersionId" = NEW.id)
    WHEN 'INSURANCE' THEN (SELECT count(*) FROM "InsuranceConfigVersion" WHERE "configurationVersionId" = NEW.id)
    WHEN 'CUSTOMER_DRIVER_REQUIREMENTS' THEN (SELECT count(*) FROM "CustomerDriverConfigVersion" WHERE "configurationVersionId" = NEW.id)
    WHEN 'BOOKING_WORKFLOW' THEN (SELECT count(*) FROM "BookingWorkflowConfigVersion" WHERE "configurationVersionId" = NEW.id)
    WHEN 'DOCUMENT_POLICY' THEN (SELECT count(*) FROM "DocumentPolicyConfigVersion" WHERE "configurationVersionId" = NEW.id)
    WHEN 'PAYMENTS' THEN (SELECT count(*) FROM "PaymentConfigVersion" WHERE "configurationVersionId" = NEW.id)
    WHEN 'CONFIRMATIONS' THEN (SELECT count(*) FROM "ConfirmationConfigVersion" WHERE "configurationVersionId" = NEW.id)
    WHEN 'LEGAL_ACCEPTANCE' THEN (SELECT count(*) FROM "LegalAcceptanceConfigVersion" WHERE "configurationVersionId" = NEW.id)
  END;

  IF total_count <> 1 OR matching_count <> 1 THEN
    RAISE EXCEPTION 'ConfigurationVersion % must have exactly one payload matching domain %', NEW.id, NEW.domain;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "ConfigurationVersion_payload_domain_check"
AFTER INSERT OR UPDATE OF "domain" ON "ConfigurationVersion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_configuration_payload_domain();

-- Each root payload also schedules the metadata constraint trigger by issuing a no-op
-- domain update. This catches a second/wrong payload inserted after metadata creation.
CREATE OR REPLACE FUNCTION schedule_configuration_payload_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_id text;
  expected_domain "ConfigurationDomainType" := TG_ARGV[1]::"ConfigurationDomainType";
  actual_domain "ConfigurationDomainType";
BEGIN
  version_id := COALESCE(to_jsonb(NEW)->>TG_ARGV[0], to_jsonb(OLD)->>TG_ARGV[0]);
  SELECT domain INTO actual_domain FROM "ConfigurationVersion" WHERE id = version_id;
  IF actual_domain IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF actual_domain <> expected_domain THEN
    RAISE EXCEPTION 'Payload table % requires domain %, but ConfigurationVersion % uses %', TG_TABLE_NAME, expected_domain, version_id, actual_domain;
  END IF;
  UPDATE "ConfigurationVersion" SET domain = domain WHERE id = version_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "GeneralRentalConfigVersion_domain" AFTER INSERT OR UPDATE OR DELETE ON "GeneralRentalConfigVersion" FOR EACH ROW EXECUTE FUNCTION schedule_configuration_payload_check('configurationVersionId', 'GENERAL_RENTAL');
CREATE TRIGGER "PricingBillingConfigVersion_domain" AFTER INSERT OR UPDATE OR DELETE ON "PricingBillingConfigVersion" FOR EACH ROW EXECUTE FUNCTION schedule_configuration_payload_check('configurationVersionId', 'PRICING_BILLING');
CREATE TRIGGER "InsuranceConfigVersion_domain" AFTER INSERT OR UPDATE OR DELETE ON "InsuranceConfigVersion" FOR EACH ROW EXECUTE FUNCTION schedule_configuration_payload_check('configurationVersionId', 'INSURANCE');
CREATE TRIGGER "CustomerDriverConfigVersion_domain" AFTER INSERT OR UPDATE OR DELETE ON "CustomerDriverConfigVersion" FOR EACH ROW EXECUTE FUNCTION schedule_configuration_payload_check('configurationVersionId', 'CUSTOMER_DRIVER_REQUIREMENTS');
CREATE TRIGGER "BookingWorkflowConfigVersion_domain" AFTER INSERT OR UPDATE OR DELETE ON "BookingWorkflowConfigVersion" FOR EACH ROW EXECUTE FUNCTION schedule_configuration_payload_check('configurationVersionId', 'BOOKING_WORKFLOW');
CREATE TRIGGER "DocumentPolicyConfigVersion_domain" AFTER INSERT OR UPDATE OR DELETE ON "DocumentPolicyConfigVersion" FOR EACH ROW EXECUTE FUNCTION schedule_configuration_payload_check('configurationVersionId', 'DOCUMENT_POLICY');
CREATE TRIGGER "PaymentConfigVersion_domain" AFTER INSERT OR UPDATE OR DELETE ON "PaymentConfigVersion" FOR EACH ROW EXECUTE FUNCTION schedule_configuration_payload_check('configurationVersionId', 'PAYMENTS');
CREATE TRIGGER "ConfirmationConfigVersion_domain" AFTER INSERT OR UPDATE OR DELETE ON "ConfirmationConfigVersion" FOR EACH ROW EXECUTE FUNCTION schedule_configuration_payload_check('configurationVersionId', 'CONFIRMATIONS');
CREATE TRIGGER "LegalAcceptanceConfigVersion_domain" AFTER INSERT OR UPDATE OR DELETE ON "LegalAcceptanceConfigVersion" FOR EACH ROW EXECUTE FUNCTION schedule_configuration_payload_check('configurationVersionId', 'LEGAL_ACCEPTANCE');

-- Active releases must point only to released domain versions, a released rate set,
-- and published legal documents. The trigger is deferred for one-transaction activation.
CREATE OR REPLACE FUNCTION enforce_active_release_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  unreleased_count integer;
  legal_count integer;
BEGIN
  IF NEW.status <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;
  IF NEW."validationStatus" NOT IN ('VALID', 'WARNING') OR NEW."activatedAt" IS NULL OR NEW."activatedById" IS NULL THEN
    RAISE EXCEPTION 'Active release % requires successful validation and activation metadata', NEW.id;
  END IF;

  SELECT count(*) INTO unreleased_count
  FROM "ConfigurationVersion"
  WHERE id IN (
    NEW."generalRentalConfigVersionId", NEW."pricingBillingConfigVersionId", NEW."insuranceConfigVersionId",
    NEW."customerDriverConfigVersionId", NEW."bookingWorkflowConfigVersionId", NEW."documentPolicyConfigVersionId",
    NEW."paymentConfigVersionId", NEW."confirmationConfigVersionId", NEW."legalAcceptanceConfigVersionId"
  ) AND status <> 'RELEASED';
  IF unreleased_count <> 0 OR (SELECT status FROM "FleetRateSet" WHERE id = NEW."fleetRateSetId") <> 'RELEASED' THEN
    RAISE EXCEPTION 'Active release % references an unreleased configuration or fleet rate set', NEW.id;
  END IF;

  SELECT count(*) INTO legal_count
  FROM "LegalAcceptanceConfigVersion" policy
  JOIN "LegalDocumentVersion" terms ON terms.id = policy."termsDocumentVersionId" AND terms.type = 'RENTAL_TERMS' AND terms.status = 'PUBLISHED'
  JOIN "LegalDocumentVersion" privacy ON privacy.id = policy."privacyDocumentVersionId" AND privacy.type = 'PRIVACY_NOTICE' AND privacy.status = 'PUBLISHED'
  WHERE policy."configurationVersionId" = NEW."legalAcceptanceConfigVersionId";
  IF legal_count <> 1 THEN
    RAISE EXCEPTION 'Active release % requires published, type-correct legal documents', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "BusinessConfigurationRelease_active_integrity_check"
AFTER INSERT OR UPDATE OF "status" ON "BusinessConfigurationRelease"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_active_release_integrity();

-- Root lifecycle rows: transition into immutable state is allowed; later business mutation/deletion is not.
CREATE OR REPLACE FUNCTION protect_configuration_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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

CREATE TRIGGER "ConfigurationVersion_immutable"
BEFORE UPDATE OR DELETE ON "ConfigurationVersion"
FOR EACH ROW EXECUTE FUNCTION protect_configuration_version();

CREATE OR REPLACE FUNCTION protect_configuration_payload()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  version_id text;
  version_status "ConfigurationVersionStatus";
BEGIN
  version_id := COALESCE(to_jsonb(OLD)->>TG_ARGV[0], to_jsonb(NEW)->>TG_ARGV[0]);
  SELECT status INTO version_status FROM "ConfigurationVersion" WHERE id = version_id;
  IF version_status IN ('RELEASED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'Payload for released configuration version % is immutable', version_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION protect_immutable_lifecycle_row()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('RELEASED', 'ARCHIVED') THEN
    RAISE EXCEPTION '% % cannot be deleted after release', TG_TABLE_NAME, OLD.id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('RELEASED', 'ARCHIVED') THEN
    IF NOT (OLD.status = 'RELEASED' AND NEW.status = 'ARCHIVED') OR
       (to_jsonb(NEW) - ARRAY['status','archivedAt','updatedAt']) <>
       (to_jsonb(OLD) - ARRAY['status','archivedAt','updatedAt']) THEN
      RAISE EXCEPTION '% % is immutable after release', TG_TABLE_NAME, OLD.id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "FleetRateSet_immutable"
BEFORE UPDATE OR DELETE ON "FleetRateSet"
FOR EACH ROW EXECUTE FUNCTION protect_immutable_lifecycle_row();

CREATE OR REPLACE FUNCTION protect_vehicle_rate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "ConfigurationVersionStatus";
BEGIN
  SELECT status INTO parent_status FROM "FleetRateSet" WHERE id = COALESCE(OLD."fleetRateSetId", NEW."fleetRateSetId");
  IF parent_status IN ('RELEASED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'Rates in released FleetRateSet % are immutable', COALESCE(OLD."fleetRateSetId", NEW."fleetRateSetId");
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "VehicleRentalRate_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "VehicleRentalRate"
FOR EACH ROW EXECUTE FUNCTION protect_vehicle_rate();

CREATE OR REPLACE FUNCTION protect_release()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('ACTIVE', 'SUPERSEDED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'Activated BusinessConfigurationRelease % cannot be deleted', OLD.id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('ACTIVE', 'SUPERSEDED', 'ARCHIVED') THEN
    IF NOT ((OLD.status = 'ACTIVE' AND NEW.status IN ('SUPERSEDED','ARCHIVED')) OR (OLD.status = 'SUPERSEDED' AND NEW.status = 'ARCHIVED')) OR
       (to_jsonb(NEW) - ARRAY['status','archivedAt','updatedAt']) <>
       (to_jsonb(OLD) - ARRAY['status','archivedAt','updatedAt']) THEN
      RAISE EXCEPTION 'Activated BusinessConfigurationRelease % is immutable', OLD.id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "BusinessConfigurationRelease_immutable"
BEFORE UPDATE OR DELETE ON "BusinessConfigurationRelease"
FOR EACH ROW EXECUTE FUNCTION protect_release();

CREATE OR REPLACE FUNCTION protect_legal_document()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('PUBLISHED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'Published LegalDocumentVersion % cannot be deleted', OLD.id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('PUBLISHED', 'ARCHIVED') THEN
    IF NOT (OLD.status = 'PUBLISHED' AND NEW.status = 'ARCHIVED') OR
       (to_jsonb(NEW) - ARRAY['status','archivedAt','updatedAt']) <>
       (to_jsonb(OLD) - ARRAY['status','archivedAt','updatedAt']) THEN
      RAISE EXCEPTION 'Published LegalDocumentVersion % is immutable', OLD.id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "LegalDocumentVersion_immutable"
BEFORE UPDATE OR DELETE ON "LegalDocumentVersion"
FOR EACH ROW EXECUTE FUNCTION protect_legal_document();

CREATE OR REPLACE FUNCTION protect_legal_translation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "LegalPublicationStatus";
BEGIN
  SELECT status INTO parent_status FROM "LegalDocumentVersion" WHERE id = COALESCE(OLD."legalDocumentVersionId", NEW."legalDocumentVersionId");
  IF parent_status IN ('PUBLISHED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'Translations for published LegalDocumentVersion % are immutable', COALESCE(OLD."legalDocumentVersionId", NEW."legalDocumentVersionId");
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "LegalDocumentTranslation_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "LegalDocumentTranslation"
FOR EACH ROW EXECUTE FUNCTION protect_legal_translation();

-- Install payload immutability triggers on every typed root/child table.
CREATE TRIGGER "GeneralRentalConfigVersion_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "GeneralRentalConfigVersion" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('configurationVersionId');
CREATE TRIGGER "PricingBillingConfigVersion_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "PricingBillingConfigVersion" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('configurationVersionId');
CREATE TRIGGER "InsuranceConfigVersion_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "InsuranceConfigVersion" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('configurationVersionId');
CREATE TRIGGER "InsuranceConfigTranslation_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "InsuranceConfigTranslation" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('insuranceConfigVersionId');
CREATE TRIGGER "InsuranceVehicleAvailability_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "InsuranceVehicleAvailability" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('insuranceConfigVersionId');
CREATE TRIGGER "CustomerDriverConfigVersion_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "CustomerDriverConfigVersion" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('configurationVersionId');
CREATE TRIGGER "CustomerFieldRule_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "CustomerFieldRule" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('customerDriverConfigVersionId');
CREATE TRIGGER "BookingWorkflowConfigVersion_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "BookingWorkflowConfigVersion" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('configurationVersionId');
CREATE TRIGGER "BookingStepRule_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "BookingStepRule" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('bookingWorkflowConfigVersionId');
CREATE TRIGGER "DocumentPolicyConfigVersion_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "DocumentPolicyConfigVersion" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('configurationVersionId');
CREATE TRIGGER "DocumentRequirementRule_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "DocumentRequirementRule" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('documentPolicyConfigVersionId');
CREATE TRIGGER "DocumentPolicyRolePermission_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "DocumentPolicyRolePermission" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('documentPolicyConfigVersionId');
CREATE TRIGGER "PaymentConfigVersion_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "PaymentConfigVersion" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('configurationVersionId');
CREATE TRIGGER "PaymentMethodRule_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "PaymentMethodRule" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('paymentConfigVersionId');
CREATE TRIGGER "PaymentInstructionTranslation_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "PaymentInstructionTranslation" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('paymentConfigVersionId');
CREATE TRIGGER "ConfirmationConfigVersion_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "ConfirmationConfigVersion" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('configurationVersionId');
CREATE TRIGGER "ConfirmationSectionRule_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "ConfirmationSectionRule" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('confirmationConfigVersionId');
CREATE TRIGGER "ConfirmationContentTranslation_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "ConfirmationContentTranslation" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('confirmationConfigVersionId');
CREATE TRIGGER "LegalAcceptanceConfigVersion_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "LegalAcceptanceConfigVersion" FOR EACH ROW EXECUTE FUNCTION protect_configuration_payload('configurationVersionId');

CREATE OR REPLACE FUNCTION reject_update_or_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only and cannot be %', TG_TABLE_NAME, lower(TG_OP);
END;
$$;

CREATE TRIGGER "BookingPricingSnapshot_append_only" BEFORE UPDATE OR DELETE ON "BookingPricingSnapshot" FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
CREATE TRIGGER "BookingCustomerDriverSnapshot_append_only" BEFORE UPDATE OR DELETE ON "BookingCustomerDriverSnapshot" FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
CREATE TRIGGER "BookingInsuranceSnapshot_append_only" BEFORE UPDATE OR DELETE ON "BookingInsuranceSnapshot" FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
CREATE TRIGGER "BookingLegalAcceptance_append_only" BEFORE UPDATE OR DELETE ON "BookingLegalAcceptance" FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
CREATE TRIGGER "AuditEvent_append_only" BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
