"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { requireCapability } from "@/lib/authorization/server"
import {
  activateDraftRelease,
  generateReleasePreview,
  validateDraftRelease,
} from "@/lib/business-configuration/workflow-service"
import {
  ConfigurationWorkflowError,
  publicConfigurationWorkflowMessage,
} from "@/lib/business-configuration/workflow-errors"

const releaseSchema = z.object({ releaseId: z.string().min(1) })
const activationSchema = releaseSchema.extend({
  expectedRevision: z.number().int().positive(),
  warningsAcknowledged: z.boolean(),
  confirmation: z.literal("Activate this configuration for future bookings"),
})

function actionError(error: unknown) {
  console.error("[BUSINESS_CONFIGURATION_ACTION_ERROR]", error)
  if (error instanceof ConfigurationWorkflowError) {
    return { error: publicConfigurationWorkflowMessage(error), code: error.code }
  }
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Invalid configuration request", code: "RELEASE_INVALID" }
  }
  return { error: "The configuration action could not be completed safely.", code: "ACTIVATION_CONFLICT" }
}

export async function validateConfigurationReleaseAction(input: unknown) {
  try {
    const user = await requireCapability(CAPABILITIES.CONFIGURATION_VALIDATE, { auditDenied: true })
    const { releaseId } = releaseSchema.parse(input)
    const result = await validateDraftRelease(releaseId, user.id)
    revalidatePath("/admin/business-configuration")
    return {
      success: true,
      release: result.release,
      validation: result.snapshot,
    }
  } catch (error) {
    return actionError(error)
  }
}

export async function previewConfigurationReleaseAction(input: unknown) {
  try {
    await requireCapability(CAPABILITIES.CONFIGURATION_VIEW)
    const { releaseId } = releaseSchema.parse(input)
    return { success: true, preview: await generateReleasePreview(releaseId) }
  } catch (error) {
    return actionError(error)
  }
}

export async function activateConfigurationReleaseAction(input: unknown) {
  try {
    const user = await requireCapability(CAPABILITIES.CONFIGURATION_ACTIVATE, { auditDenied: true })
    const validated = activationSchema.parse(input)
    const result = await activateDraftRelease({
      releaseId: validated.releaseId,
      expectedRevision: validated.expectedRevision,
      actorId: user.id,
      warningsAcknowledged: validated.warningsAcknowledged,
    })
    revalidatePath("/admin/business-configuration")
    return { success: true, result }
  } catch (error) {
    return actionError(error)
  }
}
