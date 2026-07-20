import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { newCarPublishingMode } from "@/lib/admin/new-car-publishing"

describe("new car publishing", () => {
  it("adds the first car to setup without publishing an incomplete business", () => {
    expect(newCarPublishingMode({ hasActiveRelease: false, hasPendingRelease: true })).toBe("SETUP_DRAFT")
  })

  it("protects unrelated pending owner changes from automatic publication", () => {
    expect(newCarPublishingMode({ hasActiveRelease: true, hasPendingRelease: true })).toBe("PENDING_REVIEW")
  })

  it("publishes a clean pricing-only update for an established business", () => {
    expect(newCarPublishingMode({ hasActiveRelease: true, hasPendingRelease: false })).toBe("AUTO_PUBLISH")
  })

  it("connects car creation to versioned pricing and safe release activation", () => {
    const action = readFileSync(resolve(process.cwd(), "app/actions/cars.ts"), "utf8")
    expect(action).toContain("prepareOwnerPricingEdit(admin.id)")
    expect(action).toContain("validateDraftRelease(pricing.draftRelease.id, admin.id)")
    expect(action).toContain("await activateDraftRelease({")
    expect(action).toContain('bookingStatus = "ACTIVE"')
  })
})
