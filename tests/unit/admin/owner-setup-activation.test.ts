import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("owner setup activation", () => {
  it("allows validation and activation enough time for production database latency", () => {
    const workflow = source("lib/business-configuration/workflow-service.ts")
    const validation = workflow.slice(
      workflow.indexOf("export async function validateDraftRelease"),
      workflow.indexOf("export interface ReleasePreview"),
    )
    const activation = workflow.slice(workflow.indexOf("export async function activateDraftRelease"))

    expect(validation).toContain("maxWait: 10_000")
    expect(validation).toContain("timeout: 30_000")
    expect(activation).toContain("maxWait: 10_000")
    expect(activation).toContain("timeout: 30_000")
  })

  it("does not report a completed final step when activation fails", () => {
    const action = source("app/actions/owner-setup.ts")

    expect(action).toContain("if (activation.activationFailed) return activationError()")
    expect(action).toContain("online booking could not be enabled")
    expect(action).toContain("recoverCompletedOwnerSetupAction")
  })

  it("automatically recovers a completed setup with no active release", () => {
    const page = source("app/[locale]/admin/settings/page.tsx")
    const recovery = source("components/admin/owner-setup-activation-recovery.tsx")

    expect(page).toContain("guide.completed === guide.total")
    expect(page).toContain("<OwnerSetupActivationRecovery")
    expect(recovery).toContain("recoverCompletedOwnerSetupAction()")
    expect(recovery).toContain("Enabling online booking")
  })
})
