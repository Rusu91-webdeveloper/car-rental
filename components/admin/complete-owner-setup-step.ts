"use client"

import { completeOwnerSetupStepAction, type OwnerSetupStepId } from "@/app/actions/owner-setup"

interface SetupRouter {
  push(href: string): void
  refresh(): void
}

export function ownerSetupSaveLabel(nextHref: string | undefined, isGerman = false, continueLabel?: string) {
  if (nextHref === "/admin/settings") return isGerman ? "Speichern und veröffentlichen" : "Save and publish"
  if (nextHref) return continueLabel ?? (isGerman ? "Speichern und weiter" : "Save and continue")
  return isGerman ? "Änderungen speichern" : "Save changes"
}

export async function completeOwnerSetupStep(
  stepId: OwnerSetupStepId,
  nextHref: string | undefined,
  router: SetupRouter,
) {
  if (!nextHref) {
    router.refresh()
    return undefined
  }
  const result = await completeOwnerSetupStepAction(stepId)
  if ("error" in result) return result.error
  router.push(nextHref)
  return undefined
}
