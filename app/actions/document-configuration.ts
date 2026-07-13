"use server"

import { z } from "zod"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { requireCapability } from "@/lib/authorization/server"
import { prisma } from "@/lib/db"
import { PrismaDocumentConfigurationRepository } from "@/lib/document-configuration/prisma-repository"

const rule = z.object({
  documentTypeKey: z.enum(["IDENTITY_CARD", "PASSPORT", "DRIVING_LICENCE"]),
  mode: z.enum(["REQUIRED", "OPTIONAL", "DISABLED"]),
  fileCount: z.number().int().min(1).max(2),
  sides: z.enum(["SINGLE_FILE", "FRONT_AND_BACK"]),
  instructions: z.string().max(1000),
})
const schema = z.object({
  draftReleaseId: z.string().min(1),
  expectedReleaseRevision: z.number().int().positive(),
  changeSummary: z.string().trim().min(3).max(500),
  configuration: z.object({
    identityDocumentChoice: z.enum(["DISABLED", "IDENTITY_CARD_ONLY", "PASSPORT_ONLY", "EITHER_IDENTITY_CARD_OR_PASSPORT", "BOTH"]),
    retentionPreferenceDays: z.number().int().min(1).max(365),
    requirements: z.array(rule).length(3),
  }),
})

export async function saveDocumentPolicyDraftAction(input: unknown) {
  try {
    const actor = await requireCapability(CAPABILITIES.CONFIGURATION_EDIT, { auditDenied: true })
    const value = schema.parse(input)
    const result = await new PrismaDocumentConfigurationRepository(prisma).saveDraft({ actorId: actor.id, ...value })
    return { success: true as const, ...result }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Document policy could not be saved." }
  }
}
