import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const schema = read("prisma/schema.prisma");
const migrationPaths = [
  "prisma/migrations/20260713110000_add_phase8_upload_foundation/migration.sql",
  "prisma/migrations/20260713110100_add_phase8_document_provenance/migration.sql",
  "prisma/migrations/20260713110200_add_phase8_scan_evidence/migration.sql",
  "prisma/migrations/20260713110300_add_phase8_retention_hold_deletion/migration.sql",
  "prisma/migrations/20260713110400_add_phase8_restricted_capabilities/migration.sql",
  "prisma/migrations/20260713110500_add_phase8_lifecycle_integrity/migration.sql",
  "prisma/migrations/20260721010000_allow_approved_document_booking_link/migration.sql",
  "prisma/migrations/20260721011000_use_document_slot_as_booking_sequence/migration.sql",
] as const;
const migrations = migrationPaths.map(read).join("\n");

describe("Phase 8C private-document schema and migrations", () => {
  it.each([
    "DocumentUploadSession",
    "DocumentUploadIntent",
    "DocumentMalwareScanAttempt",
    "DocumentLegalHold",
    "DocumentDeletionRequest",
    "DocumentDeletionAttempt",
  ])("declares the %s model", (model) => {
    expect(schema).toContain(`model ${model} {`);
  });

  it("keeps historical provenance nullable and versioned", () => {
    expect(schema).toContain("evidenceSchemaVersion         Int");
    expect(schema).toContain("configurationReleaseId        String?");
    expect(schema).toContain("documentPolicyConfigVersionId String?");
    expect(schema).toContain("uploadSessionId               String?");
    expect(migrations).not.toMatch(/UPDATE\s+"CustomerDocument"/i);
  });

  it("contains no public URL or binary content columns", () => {
    expect(schema).not.toMatch(
      /publicUrl|signedUrl|base64|fileContent|ocrText/,
    );
    expect(migrations).not.toMatch(
      /publicUrl|signedUrl|base64|fileContent|ocrText/,
    );
  });

  it("installs append-only, replacement, hold, and verified deletion protections", () => {
    expect(migrations).toContain("DocumentMalwareScanAttempt_append_only");
    expect(migrations).toContain("DocumentDeletionAttempt_append_only");
    expect(migrations).toContain("CustomerDocument_phase8_current_slot_key");
    expect(migrations).toContain("DocumentLegalHold_one_active_key");
    expect(migrations).toContain("Verified provider outcome is required");
    expect(migrations).toContain("replacement chain cannot contain a cycle");
  });

  it("seeds restricted roles without assigning users or extending ADMIN_COMPAT", () => {
    const seed = read(migrationPaths[4]);
    expect(seed).toContain("documents.legal-hold.manage");
    expect(seed).toContain("DOCUMENT_REVIEWER");
    expect(seed).toContain("DOCUMENT_DOWNLOADER");
    expect(seed).toContain("DOCUMENT_RETENTION_OPERATOR");
    expect(seed).toContain("DOCUMENT_LEGAL_HOLD_OFFICER");
    expect(seed).not.toContain('INSERT INTO "UserAccessRole"');
    expect(seed).not.toContain("role.key = 'ADMIN_COMPAT'");
  });

  it("uses restrictive lifecycle foreign keys", () => {
    expect(migrations).toContain(
      'REFERENCES "CustomerDocument"("id") ON DELETE RESTRICT',
    );
    expect(migrations).toContain(
      'REFERENCES "DocumentUploadSession"("id") ON DELETE RESTRICT',
    );
    expect(migrations).toContain(
      'REFERENCES "BusinessConfigurationRelease"("id") ON DELETE RESTRICT',
    );
  });

  it("permits only a provenance-checked one-time booking link for approved evidence", () => {
    const migration = read(migrationPaths[6]);
    expect(migration).toContain(
      'OLD."bookingId" IS NULL AND NEW."bookingId" IS NOT NULL AND NEW."manualReviewStatus" = \'APPROVED\'',
    );
    expect(migration).toContain(
      'booking_user <> NEW."customerUserId" OR booking_release <> NEW."configurationReleaseId"',
    );
    expect(migration).toContain(
      "CustomerDocument Booking provenance is inconsistent",
    );
    expect(migration).toContain("'bookingId','isCurrent'");
  });

  it("keeps legacy booking uniqueness separate from Phase 8 document slots", () => {
    const migration = read(migrationPaths[7]);
    expect(migration).toContain(
      'DROP INDEX IF EXISTS "CustomerDocument_bookingId_documentTypeId_side_sequence_key"',
    );
    expect(migration).toContain(
      '"CustomerDocument_legacy_booking_type_side_sequence_key"',
    );
    expect(migration).toContain('WHERE "evidenceSchemaVersion" = 1');
    expect(migrations).toContain("CustomerDocument_phase8_current_slot_key");
  });
});
