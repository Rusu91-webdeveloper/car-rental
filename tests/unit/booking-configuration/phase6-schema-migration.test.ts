import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const sql = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260713003000_add_phase6_snapshot_provenance/migration.sql"),
  "utf8",
)

describe("Phase 6 additive snapshot migration", () => {
  it("contains only additive schema operations", () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i)
    expect(sql).not.toContain('ALTER COLUMN "price"')
    expect(sql).toContain('ADD COLUMN "customerDriverConfigVersionId" TEXT')
    expect(sql).toContain('ADD COLUMN "availabilityVehicleId" TEXT')
  })

  it("enforces currency, availability, selection, provenance, relations, and indexes", () => {
    for (const evidence of [
      "BookingInsuranceSnapshot_currency_check",
      "BookingInsuranceSnapshot_availability_check",
      "BookingInsuranceSnapshot_selection_behavior_check",
      "enforce_booking_insurance_snapshot_consistency",
      "enforce_customer_driver_snapshot_provenance",
      "BookingInsuranceSnapshot_availabilityVehicleId_idx",
      "BookingCustomerDriverSnapshot_customerDriverConfigVersionId_idx",
    ])
      expect(sql).toContain(evidence)
  })

  it("backfills only exact release-backed provenance", () => {
    expect(sql).toContain('FROM "BookingPricingSnapshot" pricing_snapshot')
    expect(sql).toContain('pricing_snapshot."compatibilityMode" = false')
    expect(sql).toContain("migration will not fabricate provenance")
  })
})
