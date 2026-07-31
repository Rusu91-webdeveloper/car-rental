import { beforeEach, describe, expect, it, vi } from "vitest"

const { completeOwnerSetupStepAction } = vi.hoisted(() => ({
  completeOwnerSetupStepAction: vi.fn(),
}))

vi.mock("@/app/actions/owner-setup", () => ({
  completeOwnerSetupStepAction,
}))

import { completeOwnerSetupStep } from "@/components/admin/complete-owner-setup-step"

describe("completeOwnerSetupStep", () => {
  beforeEach(() => {
    completeOwnerSetupStepAction.mockReset()
    completeOwnerSetupStepAction.mockResolvedValue({ success: true, activated: true })
  })

  it("returns published edits to a read-only success view", async () => {
    const router = { push: vi.fn(), refresh: vi.fn() }

    await expect(
      completeOwnerSetupStep("booking-flow", "/admin/settings", router),
    ).resolves.toBeUndefined()

    expect(router.push).toHaveBeenCalledWith("/admin/settings?saved=booking-flow")
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it("continues to the next setup step during initial setup", async () => {
    const router = { push: vi.fn(), refresh: vi.fn() }

    await completeOwnerSetupStep(
      "booking-flow",
      "/admin/settings?step=driver-rules",
      router,
    )

    expect(router.push).toHaveBeenCalledWith("/admin/settings?step=driver-rules")
  })

  it("keeps the current form visible when completion fails", async () => {
    completeOwnerSetupStepAction.mockResolvedValue({ error: "Could not publish." })
    const router = { push: vi.fn(), refresh: vi.fn() }

    await expect(
      completeOwnerSetupStep("booking-flow", "/admin/settings", router),
    ).resolves.toBe("Could not publish.")

    expect(router.push).not.toHaveBeenCalled()
  })
})
