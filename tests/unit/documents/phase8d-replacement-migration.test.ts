import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260713120000_allow_pending_document_replacements/migration.sql",
  ),
  "utf8",
);

describe("Phase 8D forward replacement correction", () => {
  it("replaces the function forward without editing Phase 8C", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION enforce_phase8_customer_document()",
    );
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "CustomerDocument_replacement_commit"',
    );
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("uses the actual active pending states and a manual-review preflight", () => {
    expect(migration).toContain(
      "Multiple active pending replacements require manual review",
    );
    expect(migration).toContain(
      "\"uploadStatus\" IN ('UPLOADED', 'VERIFYING')",
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "CustomerDocument_one_pending_replacement_key"',
    );
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"CustomerDocument"/i);
  });

  it("preserves atomic promotion, stale rejection, and chain invariants", () => {
    expect(migration).toContain(
      "Committed READY replacement must be current with a non-current predecessor",
    );
    expect(migration).toContain(
      "Pending replacement cannot commit with a non-current predecessor",
    );
    expect(migration).toContain("replacement chain cannot contain a cycle");
    expect(migration).toContain("cannot replace itself");
    expect(migration).toContain('prior."attemptNumber" >= NEW."attemptNumber"');
  });
});
