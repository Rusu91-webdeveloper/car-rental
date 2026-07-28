"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { requireCapability } from "@/lib/authorization/server"
import {
  handoverPolicySchema,
  openingHoursExceptionsSchema,
  pricingBillingConfigurationSchema,
  weeklyOpeningHoursSchema,
} from "@/lib/business-configuration/schema"
import { ConfigurationWorkflowError, publicConfigurationWorkflowMessage } from "@/lib/business-configuration/workflow-errors"
import { PricingError } from "@/lib/pricing/errors"
import {
  attachPricingDraftToRelease,
  createPricingDraft,
  discardPricingDraft,
  generatePricingPreview,
  updatePricingRules,
  updateVehicleRate,
  updateVehicleRatesBulk,
  validatePricingDraft,
} from "@/lib/pricing-admin/service"

const draftSchema = z.object({
  source: z.enum(["LIVE", "LEGACY"]),
  changeSummary: z.string().trim().min(3).max(500),
})

const vehicleRateSchema = z.object({
  fleetRateSetId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  vehicleId: z.string().min(1),
  dailyRate: z.string(),
  weeklyRate: z.string().optional(),
  monthlyRate: z.string().optional(),
  weeklyRateEnabled: z.boolean(),
  monthlyRateEnabled: z.boolean(),
})

const bulkSchema = z.object({
  fleetRateSetId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  vehicleIds: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(["COPY_LEGACY", "COPY_LIVE", "ENABLE_WEEKLY", "DISABLE_WEEKLY", "ENABLE_MONTHLY", "DISABLE_MONTHLY"]),
  confirmed: z.literal(true),
})

const rulesSchema = z.object({
  pricingVersionId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  configuration: pricingBillingConfigurationSchema,
  changeSummary: z.string().trim().min(3).max(500),
  businessTimeZone: z.string().trim().min(1).max(100),
  weeklyOpeningHours: weeklyOpeningHoursSchema,
  openingHoursExceptions: openingHoursExceptionsSchema,
  handoverPolicy: handoverPolicySchema,
})

const previewSchema = z.object({
  vehicleId: z.string().min(1),
  pickupAt: z.string().datetime(),
  returnAt: z.string().datetime(),
})

function revalidatePricing() {
  revalidatePath("/admin/business-configuration")
  revalidatePath("/admin/business-configuration/pricing")
  revalidatePath("/admin/business-configuration/billing")
}

function actionError(error: unknown) {
  console.error("[PRICING_CONFIGURATION_ACTION_ERROR]", error)
  if (error instanceof ConfigurationWorkflowError) {
    return { error: publicConfigurationWorkflowMessage(error), code: error.code }
  }
  if (error instanceof PricingError) return { error: error.message, code: error.code }
  if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Invalid pricing request.", code: "INVALID_INPUT" }
  return { error: "The pricing action could not be completed safely.", code: "PRICING_ACTION_FAILED" }
}

export async function createPricingDraftAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.PRICING_MANAGE, { auditDenied: true })
    const values = draftSchema.parse(input)
    await createPricingDraft({ actorId: actor.id, ...values })
    revalidatePricing()
    return { success: true as const }
  } catch (error) { return actionError(error) }
}

export async function updateVehicleRateAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.PRICING_MANAGE, { auditDenied: true })
    const values = vehicleRateSchema.parse(input)
    const result = await updateVehicleRate({ actorId: actor.id, ...values })
    revalidatePricing()
    return { success: true as const, result }
  } catch (error) { return actionError(error) }
}

export async function updateVehicleRatesBulkAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.PRICING_MANAGE, { auditDenied: true })
    const values = bulkSchema.parse(input)
    const result = await updateVehicleRatesBulk({ actorId: actor.id, ...values })
    revalidatePricing()
    return { success: true as const, result }
  } catch (error) { return actionError(error) }
}

export async function updatePricingRulesAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.PRICING_MANAGE, { auditDenied: true })
    const values = rulesSchema.parse(input)
    const result = await updatePricingRules({ actorId: actor.id, ...values })
    revalidatePricing()
    return { success: true as const, result }
  } catch (error) { return actionError(error) }
}

export async function validatePricingDraftAction() {
  try {
    const actor = await requireCapability(CAPABILITIES.CONFIGURATION_VALIDATE, { auditDenied: true })
    const result = await validatePricingDraft({ actorId: actor.id })
    revalidatePricing()
    return { success: true as const, result }
  } catch (error) { return actionError(error) }
}

export async function attachPricingDraftToReleaseAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.PRICING_MANAGE, { auditDenied: true })
    const { expectedReleaseRevision } = z.object({ expectedReleaseRevision: z.number().int().positive().optional() }).parse(input)
    const result = await attachPricingDraftToRelease({ actorId: actor.id, expectedReleaseRevision })
    revalidatePricing()
    return { success: true as const, result }
  } catch (error) { return actionError(error) }
}

export async function discardPricingDraftAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.PRICING_MANAGE, { auditDenied: true })
    z.object({ confirmation: z.literal("Discard pricing draft") }).parse(input)
    const result = await discardPricingDraft({ actorId: actor.id })
    revalidatePricing()
    return { success: true as const, result }
  } catch (error) { return actionError(error) }
}

export async function generatePricingPreviewAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.CONFIGURATION_VIEW)
    const values = previewSchema.parse(input)
    const result = await generatePricingPreview({ actorId: actor.id, vehicleId: values.vehicleId, pickupAt: new Date(values.pickupAt), returnAt: new Date(values.returnAt) })
    return { success: true as const, result }
  } catch (error) { return actionError(error) }
}
