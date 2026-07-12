"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { requireAnyCapability, requireCapability } from "@/lib/authorization/server"
import {
  bookingWorkflowConfigurationSchema,
  customerDriverRequirementsConfigurationSchema,
} from "@/lib/business-configuration/schema"
import {
  ConfigurationWorkflowError,
  publicConfigurationWorkflowMessage,
} from "@/lib/business-configuration/workflow-errors"
import {
  attachPhase6DraftsToRelease,
  createPhase6Draft,
  discardPhase6Draft,
  updateBookingWorkflowDraft,
  updateCustomerFieldDraft,
  updateDriverRequirementsDraft,
  updateInsuranceDraft,
  validatePhase6Drafts,
} from "@/lib/phase6-admin/service"

const createSchema = z.object({
  domain: z.enum(["INSURANCE", "CUSTOMER_DRIVER_REQUIREMENTS", "BOOKING_WORKFLOW"]),
  source: z.enum(["LIVE", "DEFAULT"]),
  changeSummary: z.string().trim().min(3).max(500),
})
const base = z.object({
  versionId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  changeSummary: z.string().trim().min(3).max(500),
})
const insuranceSchema = base.extend({
  configuration: z.object({
    enabled: z.boolean(),
    customerFacingName: z.string().trim().min(1).max(200),
    shortDescription: z.string().trim().max(500).optional(),
    selectionMode: z.enum(["OPTIONAL", "MANDATORY"]),
    pricePerDay: z.string(),
    taxTreatment: z.enum(["INHERIT_RENTAL", "TAX_INCLUDED", "TAX_EXCLUDED"]),
    availabilityScope: z.enum(["ALL_VEHICLES", "SELECTED_VEHICLES"]),
    vehicleIds: z.array(z.string().min(1)),
    showInConfirmation: z.boolean(),
    showCustomerSelection: z.boolean(),
    preselectedByDefault: z.boolean(),
  }),
})
const customerSchema = base.extend({
  configuration: customerDriverRequirementsConfigurationSchema,
})
const workflowSchema = base.extend({
  configuration: bookingWorkflowConfigurationSchema,
})

function refresh() {
  revalidatePath("/admin/business-configuration")
}
function failure(error: unknown) {
  console.error("[PHASE6_CONFIGURATION_ACTION_ERROR]", error)
  if (error instanceof ConfigurationWorkflowError)
    return {
      error: publicConfigurationWorkflowMessage(error),
      code: error.code,
    }
  if (error instanceof z.ZodError)
    return {
      error: error.issues[0]?.message ?? "Invalid configuration request.",
      code: "INVALID_INPUT",
    }
  return {
    error: "The configuration action could not be completed safely.",
    code: "CONFIGURATION_ERROR",
  }
}

export async function createPhase6DraftAction(input: unknown) {
  try {
    const values = createSchema.parse(input)
    const capabilities =
      values.domain === "INSURANCE"
        ? [CAPABILITIES.INSURANCE_MANAGE]
        : values.domain === "CUSTOMER_DRIVER_REQUIREMENTS"
          ? [
              CAPABILITIES.DRIVER_REQUIREMENTS_MANAGE,
              CAPABILITIES.CUSTOMER_FIELDS_MANAGE,
              CAPABILITIES.CONFIGURATION_EDIT,
            ]
          : [CAPABILITIES.BOOKING_WORKFLOW_MANAGE]
    const actor = await requireAnyCapability(capabilities, {
      auditDenied: true,
    })
    await createPhase6Draft({ actorId: actor.id, ...values })
    refresh()
    return { success: true as const }
  } catch (error) {
    return failure(error)
  }
}
export async function updateInsuranceDraftAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.INSURANCE_MANAGE, {
      auditDenied: true,
    })
    const values = insuranceSchema.parse(input)
    const result = await updateInsuranceDraft({ actorId: actor.id, ...values })
    refresh()
    return { success: true as const, result }
  } catch (error) {
    return failure(error)
  }
}
export async function updateDriverRequirementsDraftAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.DRIVER_REQUIREMENTS_MANAGE, { auditDenied: true })
    const values = customerSchema.parse(input)
    const result = await updateDriverRequirementsDraft({
      actorId: actor.id,
      ...values,
    })
    refresh()
    return { success: true as const, result }
  } catch (error) {
    return failure(error)
  }
}
export async function updateCustomerFieldDraftAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.CUSTOMER_FIELDS_MANAGE, {
      auditDenied: true,
    })
    const values = customerSchema.parse(input)
    const result = await updateCustomerFieldDraft({
      actorId: actor.id,
      ...values,
    })
    refresh()
    return { success: true as const, result }
  } catch (error) {
    return failure(error)
  }
}
export async function updateBookingWorkflowDraftAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.BOOKING_WORKFLOW_MANAGE, { auditDenied: true })
    const values = workflowSchema.parse(input)
    const result = await updateBookingWorkflowDraft({
      actorId: actor.id,
      ...values,
    })
    refresh()
    return { success: true as const, result }
  } catch (error) {
    return failure(error)
  }
}
export async function validatePhase6DraftsAction() {
  try {
    const actor = await requireCapability(CAPABILITIES.CONFIGURATION_VALIDATE, {
      auditDenied: true,
    })
    const result = await validatePhase6Drafts({ actorId: actor.id })
    refresh()
    return { success: true as const, result }
  } catch (error) {
    return failure(error)
  }
}
export async function attachPhase6DraftsAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.CONFIGURATION_EDIT, {
      auditDenied: true,
    })
    const values = z
      .object({
        expectedReleaseRevision: z.number().int().positive().optional(),
      })
      .parse(input)
    const result = await attachPhase6DraftsToRelease({
      actorId: actor.id,
      ...values,
    })
    refresh()
    return { success: true as const, result }
  } catch (error) {
    return failure(error)
  }
}

export async function discardPhase6DraftAction(input: unknown) {
  try {
    const values = z
      .object({
        domain: z.enum(["INSURANCE", "CUSTOMER_DRIVER_REQUIREMENTS", "BOOKING_WORKFLOW"]),
        versionId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
      })
      .parse(input)
    const capabilities =
      values.domain === "INSURANCE"
        ? [CAPABILITIES.INSURANCE_MANAGE]
        : values.domain === "CUSTOMER_DRIVER_REQUIREMENTS"
          ? [CAPABILITIES.DRIVER_REQUIREMENTS_MANAGE, CAPABILITIES.CUSTOMER_FIELDS_MANAGE]
          : [CAPABILITIES.BOOKING_WORKFLOW_MANAGE]
    const actor = await requireAnyCapability(capabilities, {
      auditDenied: true,
    })
    await discardPhase6Draft({ actorId: actor.id, ...values })
    refresh()
    return { success: true as const }
  } catch (error) {
    return failure(error)
  }
}
