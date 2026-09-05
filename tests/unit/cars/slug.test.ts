import { describe, expect, it } from "vitest"
import {
  createCarSlugBase,
  getNextCarSlug,
  isSlugUniqueConstraintError,
} from "@/lib/cars/slug"

describe("car URL slugs", () => {
  it("creates a readable slug from the car name", () => {
    expect(createCarSlugBase("  Volkswagen Passat CC  ")).toBe("volkswagen-passat-cc")
    expect(createCarSlugBase("Škoda Superb")).toBe("skoda-superb")
    expect(createCarSlugBase("Straße Edition")).toBe("strasse-edition")
  })

  it("uses a safe fallback when a name has no URL-safe characters", () => {
    expect(createCarSlugBase("🚙")).toBe("car")
  })

  it("allocates the next readable slug for duplicate car names", () => {
    expect(getNextCarSlug("volkswagen-passat", [])).toBe("volkswagen-passat")
    expect(getNextCarSlug("volkswagen-passat", ["volkswagen-passat"])).toBe(
      "volkswagen-passat-2",
    )
    expect(
      getNextCarSlug("volkswagen-passat", [
        "volkswagen-passat",
        "volkswagen-passat-2",
        "volkswagen-passat-4",
      ]),
    ).toBe("volkswagen-passat-3")
  })

  it("recognizes only Prisma slug conflicts", () => {
    expect(isSlugUniqueConstraintError({ code: "P2002", meta: { target: ["slug"] } })).toBe(true)
    expect(isSlugUniqueConstraintError({ code: "P2002", meta: { target: ["email"] } })).toBe(false)
    expect(isSlugUniqueConstraintError(new Error("slug"))).toBe(false)
  })
})
