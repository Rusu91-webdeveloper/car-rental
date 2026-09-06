import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { createCarSchema } from "@/lib/validations"

const validCar = {
  name: "Test Car",
  nameDe: "Testauto",
  description: "A complete English description.",
  descriptionDe: "Eine vollständige deutsche Beschreibung.",
  category: "FAMILY_CAR",
  price: 5000,
  image: "https://example.com/car.jpg",
  gearbox: "Automatic",
  seats: 5,
  fuelType: "Petrol",
}

describe("optional car specifications", () => {
  it("accepts both new categories", () => {
    expect(createCarSchema.parse(validCar).category).toBe("FAMILY_CAR")
    expect(createCarSchema.parse({ ...validCar, category: "KOMBI" }).category).toBe("KOMBI")
  })

  it("normalizes omitted optional specifications without inventing data", () => {
    const result = createCarSchema.parse(validCar)
    expect(result.acceleration).toBeNull()
    expect(result.year).toBeUndefined()
  })

  it("uses a forward-only migration that preserves existing values", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "prisma/migrations/20260906120000_add_family_kombi_and_optional_acceleration/migration.sql"),
      "utf8",
    )
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'FAMILY_CAR'")
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'KOMBI'")
    expect(migration).toContain('ALTER COLUMN "acceleration" DROP NOT NULL')
    expect(migration).not.toMatch(/\b(?:DELETE|DROP TABLE|DROP COLUMN|TRUNCATE)\b/)
  })
})
