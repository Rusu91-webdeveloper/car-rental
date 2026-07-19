"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ensureOwnerDraftRelease } from "@/lib/admin/owner-settings-edit"
import { requireAdmin } from "@/lib/auth"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { requireCapability } from "@/lib/authorization/server"
import { legalAcceptanceConfigurationSchema } from "@/lib/business-configuration/schema"
import { ConfigurationWorkflowError, publicConfigurationWorkflowMessage } from "@/lib/business-configuration/workflow-errors"
import { archiveLegalVersion, attachLegalDraftToRelease, createLegalAcceptanceDraft, createLegalDraft, discardLegalDraft, loadLegalAdministrationPage, publishLegalVersion, updateLegalAcceptanceDraft, updateLegalDraft, validateLegalAcceptanceDraft, validateLegalDocumentDraft } from "@/lib/legal/service"
import { OwnerLegalSetupError, saveOwnerLegalSetup } from "@/lib/legal/owner-setup"
import { ownerLegalSetupSchema } from "@/lib/legal/owner-setup-schema"

const translation = z.object({ locale: z.string().trim().min(2).max(10), title: z.string().max(300), canonicalContent: z.string().max(500_000) })
const refresh = () => { revalidatePath("/admin/settings"); revalidatePath("/admin/settings/legal"); revalidatePath("/admin/business-configuration/legal"); revalidatePath("/admin/business-configuration/overview") }
function failure(error: unknown) {
  console.error("[LEGAL_CONFIGURATION_ACTION_ERROR]", {
    name: error instanceof Error ? error.name : "Unknown",
    code: error instanceof ConfigurationWorkflowError ? error.code : error instanceof z.ZodError ? "INVALID_INPUT" : "LEGAL_OPERATION_FAILED",
  })
  if (error instanceof OwnerLegalSetupError) return { error: error.message, code: "OWNER_LEGAL_SETUP_INVALID" }
  if (error instanceof ConfigurationWorkflowError) return { error: publicConfigurationWorkflowMessage(error), code: error.code }
  if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Invalid legal request.", code: "INVALID_INPUT" }
  return { error: "The legal action could not be completed safely.", code: "LEGAL_OPERATION_FAILED" }
}

export async function saveOwnerLegalSetupAction(input: unknown) {
  try {
    const actor = await requireAdmin()
    const value = ownerLegalSetupSchema.parse(input)
    await ensureOwnerDraftRelease(actor.id)
    await saveOwnerLegalSetup({ actorId: actor.id, value })
    refresh()
    return { success: true as const }
  } catch (error) {
    return failure(error)
  }
}

export async function createLegalDraftAction(input: unknown) { try { const actor = await requireCapability(CAPABILITIES.LEGAL_EDIT, { auditDenied: true }); const values = z.object({ type: z.enum(["RENTAL_TERMS", "PRIVACY_NOTICE"]), primaryLocale: z.string().min(2).max(10), changeSummary: z.string().trim().min(3).max(500), sourceDocumentId: z.string().optional() }).parse(input); const id = await createLegalDraft({ actorId: actor.id, ...values }); refresh(); return { success: true as const, id } } catch (error) { return failure(error) } }
export async function updateLegalDraftAction(input: unknown) { try { const actor = await requireCapability(CAPABILITIES.LEGAL_EDIT, { auditDenied: true }); const values = z.object({ documentId: z.string().min(1), expectedRevision: z.number().int().positive(), primaryLocale: z.string().min(2).max(10), changeSummary: z.string().trim().min(3).max(500), translations: z.array(translation).min(1).max(20) }).parse(input); await updateLegalDraft({ actorId: actor.id, ...values }); refresh(); return { success: true as const } } catch (error) { return failure(error) } }
export async function discardLegalDraftAction(input: unknown) { try { const actor = await requireCapability(CAPABILITIES.LEGAL_EDIT, { auditDenied: true }); const values = z.object({ documentId: z.string(), expectedRevision: z.number().int().positive() }).parse(input); await discardLegalDraft({ actorId: actor.id, ...values }); refresh(); return { success: true as const } } catch (error) { return failure(error) } }
export async function validateLegalDraftAction(input: unknown) { try { const actor = await requireCapability(CAPABILITIES.CONFIGURATION_VALIDATE, { auditDenied: true }); const values = z.object({ documentId: z.string(), expectedRevision: z.number().int().positive() }).parse(input); const page = await loadLegalAdministrationPage(); const requiredLocales = page.draftAcceptance?.configuration.bookingEnforcementEnabled ? page.draftAcceptance.configuration.requiredLocales : [page.documents.find(({ id }) => id === values.documentId)?.primaryLocale ?? page.supportedLocales[0]]; const result = await validateLegalDocumentDraft({ actorId: actor.id, ...values, supportedLocales: page.supportedLocales, requiredLocales }); refresh(); return { success: true as const, result } } catch (error) { return failure(error) } }
export async function publishLegalVersionAction(input: unknown) { try { const actor = await requireCapability(CAPABILITIES.LEGAL_PUBLISH, { auditDenied: true }); const values = z.object({ documentId: z.string(), expectedRevision: z.number().int().positive(), warningsAcknowledged: z.boolean() }).parse(input); const page = await loadLegalAdministrationPage(); const document = page.documents.find(({ id }) => id === values.documentId); const requiredLocales = page.draftAcceptance?.configuration.bookingEnforcementEnabled ? page.draftAcceptance.configuration.requiredLocales : [document?.primaryLocale ?? page.supportedLocales[0]]; await publishLegalVersion({ actorId: actor.id, ...values, supportedLocales: page.supportedLocales, requiredLocales }); refresh(); return { success: true as const } } catch (error) { return failure(error) } }
export async function archiveLegalVersionAction(input: unknown) { try { const actor = await requireCapability(CAPABILITIES.LEGAL_PUBLISH, { auditDenied: true }); const values = z.object({ documentId: z.string() }).parse(input); await archiveLegalVersion({ actorId: actor.id, ...values }); refresh(); return { success: true as const } } catch (error) { return failure(error) } }
export async function createLegalAcceptanceDraftAction(input: unknown) { try { const actor = await requireCapability(CAPABILITIES.LEGAL_EDIT, { auditDenied: true }); const values = z.object({ source: z.enum(["LIVE", "DEFAULT"]) }).parse(input); await createLegalAcceptanceDraft({ actorId: actor.id, ...values }); refresh(); return { success: true as const } } catch (error) { return failure(error) } }
export async function updateLegalAcceptanceDraftAction(input: unknown) { try { const actor = await requireCapability(CAPABILITIES.LEGAL_EDIT, { auditDenied: true }); const values = z.object({ versionId: z.string(), expectedRevision: z.number().int().positive(), changeSummary: z.string().trim().min(3).max(500), configuration: legalAcceptanceConfigurationSchema }).parse(input); await updateLegalAcceptanceDraft({ actorId: actor.id, ...values }); refresh(); return { success: true as const } } catch (error) { return failure(error) } }
export async function validateLegalAcceptanceDraftAction() { try { const actor = await requireCapability(CAPABILITIES.CONFIGURATION_VALIDATE, { auditDenied: true }); const result = await validateLegalAcceptanceDraft({ actorId: actor.id }); refresh(); return { success: true as const, result } } catch (error) { return failure(error) } }
export async function attachLegalDraftToReleaseAction(input: unknown) { try { const actor = await requireCapability(CAPABILITIES.CONFIGURATION_EDIT, { auditDenied: true }); const values = z.object({ versionId: z.string(), expectedReleaseRevision: z.number().int().positive().optional() }).parse(input); await attachLegalDraftToRelease({ actorId: actor.id, ...values }); refresh(); return { success: true as const } } catch (error) { return failure(error) } }
