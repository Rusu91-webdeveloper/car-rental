import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const sql = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260713100000_add_phase7_legal_provenance/migration.sql"),
  "utf8",
)

describe("Phase 7 additive legal provenance migration", () => {
  it("contains no destructive schema operations or Car.price changes", () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i)
    expect(sql).not.toContain('ALTER COLUMN "price"')
    expect(sql).toContain('ADD VALUE IF NOT EXISTS \'DISABLED\'')
    expect(sql).toContain('ADD COLUMN "configurationReleaseId" TEXT')
    expect(sql).toContain('ADD COLUMN "legalAcceptanceConfigVersionId" TEXT')
  })

  it("preserves nullable historical provenance and uses exact-evidence backfill", () => {
    expect(sql).not.toMatch(/ALTER COLUMN "configurationReleaseId" SET NOT NULL/)
    expect(sql).not.toMatch(/ALTER COLUMN "legalAcceptanceConfigVersionId" SET NOT NULL/)
    expect(sql).toContain('pricing."compatibilityMode" = false')
    expect(sql).toContain('acceptance."contentHash" = translation."contentHash"')
    expect(sql).toContain("Backfill acceptance provenance only where every immutable relationship agrees")
  })

  it("installs publication, locale, immutability, acceptance, and archive protections", () => {
    for (const evidence of [
      "LegalDocumentVersion_publication_provenance",
      "LegalDocumentVersion_active_archive_guard",
      "LegalAcceptanceConfigVersion_phase7_consistency",
      "LegalAcceptanceTranslation_immutable",
      "BusinessConfigurationRelease_phase7_legal",
      "BookingLegalAcceptance_accepted_check",
      "BookingLegalAcceptance_phase7_consistency",
      "explicit customer checkbox evidence",
    ])
      expect(sql).toContain(evidence)
  })
})
