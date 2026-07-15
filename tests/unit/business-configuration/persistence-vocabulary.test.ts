import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import {
  BOOKING_STEPS,
  CONFIRMATION_SECTIONS,
  CUSTOMER_FIELD_MODES,
  CUSTOMER_FIELDS,
  DOCUMENT_REQUIREMENT_MODES,
  DOCUMENT_TYPES,
  PAYMENT_METHODS,
} from "@/lib/business-configuration/domains"

const compatibilityMigration = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260712213500_add_compatibility_data_and_immutability/migration.sql"),
  "utf8",
)
const phase6Capabilities = readFileSync(resolve(process.cwd(), "scripts/phase6-capabilities.sql"), "utf8")
const phase8Capabilities = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260713110400_add_phase8_restricted_capabilities/migration.sql"),
  "utf8",
)
const phase8fCapabilities = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260713130000_add_phase8f_manual_review/migration.sql"),
  "utf8",
)
const prismaSchema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8")

function prismaEnumValues(name: string) {
  const match = prismaSchema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\}`))
  if (!match) throw new Error(`Missing Prisma enum ${name}`)
  return match[1]
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean)
}

describe("persisted Business Configuration vocabulary", () => {
  it.each(DOCUMENT_TYPES)("seeds document type %s", (key) => {
    expect(compatibilityMigration).toContain(`'${key}'`)
  })

  it.each(CONFIRMATION_SECTIONS)("seeds confirmation section %s", (key) => {
    expect(compatibilityMigration).toContain(`'${key}'`)
  })

  it.each(Object.values(CAPABILITIES))("seeds capability %s", (key) => {
    expect(`${compatibilityMigration}\n${phase6Capabilities}\n${phase8Capabilities}\n${phase8fCapabilities}`).toContain(`'${key}'`)
  })

  it("keeps closed Prisma enums aligned with application contracts", () => {
    expect(prismaEnumValues("CustomerFieldType")).toEqual([...CUSTOMER_FIELDS])
    expect(prismaEnumValues("CustomerFieldMode")).toEqual([...CUSTOMER_FIELD_MODES])
    expect(prismaEnumValues("BookingStepType")).toEqual([...BOOKING_STEPS])
    expect(prismaEnumValues("DocumentRequirementMode")).toEqual([...DOCUMENT_REQUIREMENT_MODES])
    expect(prismaEnumValues("ConfiguredPaymentMode")).toEqual([...PAYMENT_METHODS])
  })
})
