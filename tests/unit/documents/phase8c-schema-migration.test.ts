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
});
