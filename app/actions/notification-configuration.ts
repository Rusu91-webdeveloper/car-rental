"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { requireAllCapabilities, requireCapability } from "@/lib/authorization/server"
import { confirmationConfigurationSchema } from "@/lib/business-configuration/schema"
import {
  ConfigurationWorkflowError,
  publicConfigurationWorkflowMessage,
} from "@/lib/business-configuration/workflow-errors"
import {
  createNotificationConfigurationDraft,
  updateConfirmationContentDraft,
  updatePaymentInstructionDraft,
} from "@/lib/notification-configuration/service"
import { validIban } from "@/lib/iban"

const manualMethod = z.enum(["BANK_TRANSFER", "CASH_ON_PICKUP"])
const base = z.object({
  versionId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  changeSummary: z.string().trim().min(3).max(500),
})

function refresh() {
  revalidatePath("/admin/business-configuration")
  revalidatePath("/admin/payments")
  revalidatePath("/admin/settings/notifications")
  revalidatePath("/admin/advanced/configuration")
}

function failure(error: unknown) {
  console.error("[NOTIFICATION_CONFIGURATION_ACTION_ERROR]", error)
  if (error instanceof ConfigurationWorkflowError)
    return { error: publicConfigurationWorkflowMessage(error), code: error.code }
  if (error instanceof z.ZodError)
    return { error: error.issues[0]?.message ?? "Invalid configuration request.", code: "INVALID_INPUT" }
  return { error: "The notification configuration could not be saved safely.", code: "CONFIGURATION_ERROR" }
}

export async function createNotificationConfigurationDraftAction(input: unknown) {
  try {
    const actor = await requireAllCapabilities(
      [CAPABILITIES.CONFIGURATION_EDIT, CAPABILITIES.PAYMENTS_MANAGE, CAPABILITIES.CONFIRMATIONS_MANAGE],
      { auditDenied: true },
    )
    const values = z.object({ changeSummary: z.string().trim().min(3).max(500) }).parse(input)
    const result = await createNotificationConfigurationDraft({ actorId: actor.id, ...values })
    refresh()
    return { success: true as const, result }
  } catch (error) {
    return failure(error)
  }
}

export async function updatePaymentInstructionDraftAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.PAYMENTS_MANAGE, { auditDenied: true })
    const values = base.extend({
      defaultMethod: manualMethod,
      enabledMethods: z.array(manualMethod).min(1),
      depositEnabled: z.boolean(),
      depositPercentage: z.number().int().min(1).max(100),
      paymentProfile: z.object({
        bankName: z.string().trim().max(160),
        accountName: z.string().trim().max(160),
        accountNumber: z.string().trim().max(80),
        swiftCode: z.string().trim().max(30),
        iban: z.string().trim().max(50).refine((value) => !value || validIban(value), "Enter a valid IBAN"),
        guaranteePercentage: z.number().min(0).max(1),
      }),
      instructions: z.array(z.object({
        method: manualMethod,
        locale: z.string().trim().min(2).max(10),
        instructions: z.string().trim().min(1).max(5_000),
      })),
    }).parse(input)
    const result = await updatePaymentInstructionDraft({ actorId: actor.id, ...values })
    refresh()
    return { success: true as const, result }
  } catch (error) {
    return failure(error)
  }
}

export async function updateOwnerPaymentDraft(input: unknown) {
  return updatePaymentInstructionDraftAction(input)
}

export async function updateConfirmationContentDraftAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.CONFIRMATIONS_MANAGE, { auditDenied: true })
    const values = base.extend({ configuration: confirmationConfigurationSchema }).parse(input)
    const result = await updateConfirmationContentDraft({ actorId: actor.id, ...values })
    refresh()
    return { success: true as const, result }
  } catch (error) {
    return failure(error)
  }
}
