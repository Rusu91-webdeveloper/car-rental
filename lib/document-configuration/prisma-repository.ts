import { Prisma, type PrismaClient } from "@prisma/client"
import type { DocumentConfigurationPageData, DocumentPolicyDraftInput } from "./types"
import {
  DEFAULT_DOCUMENT_ROLE_PERMISSIONS,
  defaultDocumentRolePermission,
} from "./default-role-permissions"

const KEYS = ["IDENTITY_CARD", "PASSPORT", "DRIVING_LICENCE"] as const

function validate(input: DocumentPolicyDraftInput) {
  if (input.retentionPreferenceDays < 1 || input.retentionPreferenceDays > 365)
    throw new Error("Retention must be between 1 and 365 days.")
  if (input.requirements.length !== 3 || new Set(input.requirements.map((value) => value.documentTypeKey)).size !== 3)
    throw new Error("Exactly one typed rule is required for ID card, passport, and driving licence.")
  for (const rule of input.requirements) {
    if (!KEYS.includes(rule.documentTypeKey) || rule.fileCount < 1 || rule.fileCount > 2)
      throw new Error("Document rule is outside approved limits.")
    if (rule.mode !== "DISABLED" && !rule.instructions.trim())
      throw new Error("Customer instructions are required for enabled rules.")
  }
  const mode = (key: (typeof KEYS)[number]) => input.requirements.find((value) => value.documentTypeKey === key)?.mode
  const enabled = (key: (typeof KEYS)[number]) => mode(key) !== "DISABLED"
  if (input.identityDocumentChoice === "IDENTITY_CARD_ONLY" && !enabled("IDENTITY_CARD")) throw new Error("ID card must be enabled.")
  if (input.identityDocumentChoice === "PASSPORT_ONLY" && !enabled("PASSPORT")) throw new Error("Passport must be enabled.")
  if (input.identityDocumentChoice === "BOTH" && (!enabled("IDENTITY_CARD") || !enabled("PASSPORT"))) throw new Error("Both identity types must be enabled.")
  if (input.identityDocumentChoice === "EITHER_IDENTITY_CARD_OR_PASSPORT" && (!enabled("IDENTITY_CARD") || !enabled("PASSPORT"))) throw new Error("Both identity alternatives must be enabled.")
  if (input.identityDocumentChoice === "DISABLED" && (mode("IDENTITY_CARD") === "REQUIRED" || mode("PASSPORT") === "REQUIRED")) throw new Error("Required identity rules conflict with a disabled identity choice.")
  return input
}

function configuration(row: {
  retentionPreferenceDays: number
  identityDocumentChoice: DocumentPolicyDraftInput["identityDocumentChoice"]
  requirements: Array<{
    mode: "REQUIRED" | "OPTIONAL" | "DISABLED"
    fileCount: number
    sides: "SINGLE_FILE" | "FRONT_AND_BACK"
    documentType: { key: string }
    translations: Array<{ locale: string; instructions: string }>
  }>
}): DocumentPolicyDraftInput {
  return {
    retentionPreferenceDays: row.retentionPreferenceDays,
    identityDocumentChoice: row.identityDocumentChoice,
    requirements: KEYS.map((key) => {
      const rule = row.requirements.find((value) => value.documentType.key === key)
      return {
        documentTypeKey: key,
        mode: rule?.mode ?? "DISABLED",
        fileCount: rule?.fileCount ?? 1,
        sides: rule?.sides ?? "SINGLE_FILE",
        instructions: rule?.translations.find((value) => value.locale === "en")?.instructions ?? rule?.translations[0]?.instructions ?? "",
      }
    }),
  }
}

export class PrismaDocumentConfigurationRepository {
  constructor(private readonly db: PrismaClient) {}

  async load(canEdit: boolean, healthCodes: string[]): Promise<DocumentConfigurationPageData> {
    const [active, draft] = await Promise.all([
      this.db.businessConfigurationRelease.findFirst({
        where: { status: "ACTIVE" },
        include: {
          documentPolicyConfig: {
            include: {
              version: true,
              requirements: { include: { documentType: true, translations: true } },
            },
          },
        },
      }),
      this.db.businessConfigurationRelease.findFirst({
        where: { status: { in: ["DRAFT", "VALIDATED"] } },
        orderBy: { releaseNumber: "desc" },
        select: { id: true, releaseNumber: true, revision: true },
      }),
    ])
    return {
      active: active
        ? {
            releaseId: active.id,
            releaseNumber: active.releaseNumber,
            versionId: active.documentPolicyConfigVersionId,
            versionNumber: active.documentPolicyConfig.version.versionNumber,
            validationStatus: active.documentPolicyConfig.version.validationStatus,
            configuration: configuration(active.documentPolicyConfig),
          }
        : undefined,
      draftRelease: draft ?? undefined,
      canEdit,
      healthCodes,
    }
  }

  async saveDraft(input: {
    actorId: string
    draftReleaseId: string
    expectedReleaseRevision: number
    changeSummary: string
    configuration: DocumentPolicyDraftInput
  }) {
    const value = validate(input.configuration)
    return this.db.$transaction(async (tx) => {
      const release = await tx.businessConfigurationRelease.findFirst({
        where: {
          id: input.draftReleaseId,
          revision: input.expectedReleaseRevision,
          status: { in: ["DRAFT", "VALIDATED"] },
        },
        include: { documentPolicyConfig: { include: { rolePermissions: true } } },
      })
      if (!release) throw new Error("Draft release changed. Reload before saving.")
      const definitions = await tx.documentTypeDefinition.findMany({ where: { key: { in: [...KEYS] }, isActive: true } })
      if (definitions.length !== 3) throw new Error("System document type definitions are incomplete.")
      const maximum = await tx.configurationVersion.aggregate({ where: { domain: "DOCUMENT_POLICY" }, _max: { versionNumber: true } })
      const version = await tx.configurationVersion.create({
        data: {
          domain: "DOCUMENT_POLICY",
          versionNumber: (maximum._max.versionNumber ?? 0) + 1,
          status: "DRAFT",
          validationStatus: "VALID",
          validationSnapshot: {
            schema: "private-document-policy-v1",
            manualReviewRequired: true,
            retentionHardMaximumDays: 365,
          } as Prisma.InputJsonValue,
          changeSummary: input.changeSummary,
          createdById: input.actorId,
          updatedById: input.actorId,
          validatedById: input.actorId,
          validatedAt: new Date(),
          documentPolicy: {
            create: {
              retentionPreferenceDays: value.retentionPreferenceDays,
              identityDocumentChoice: value.identityDocumentChoice,
              showReminderInConfirmation: true,
            },
          },
        },
      })
      for (const rule of value.requirements) {
        const definition = definitions.find((item) => item.key === rule.documentTypeKey)!
        await tx.documentRequirementRule.create({
          data: {
            documentPolicyConfigVersionId: version.id,
            documentTypeId: definition.id,
            mode: rule.mode,
            fileCount: rule.fileCount,
            sides: rule.sides,
            uploadStage: "DURING_BOOKING",
            translations: {
              create: { locale: "en", instructions: rule.instructions.trim() || "Not requested for this policy." },
            },
          },
        })
      }
      const inheritedPermissions =
        release.documentPolicyConfig.rolePermissions.length > 0
          ? release.documentPolicyConfig.rolePermissions.map((permission) => ({
              accessRoleId: permission.accessRoleId,
              mayView: permission.mayView,
              mayDownload: permission.mayDownload,
              mayDelete: permission.mayDelete,
              mayManageLegalHold: permission.mayManageLegalHold,
            }))
          : (
              await tx.accessRole.findMany({
                where: {
                  key: {
                    in: Object.keys(DEFAULT_DOCUMENT_ROLE_PERMISSIONS),
                  },
                  status: "ACTIVE",
                },
                select: { id: true, key: true },
              })
            ).flatMap((role) => {
              const permission = defaultDocumentRolePermission(role.key)
              return permission
                ? [{ accessRoleId: role.id, ...permission }]
                : []
            })
      if (inheritedPermissions.length)
        await tx.documentPolicyRolePermission.createMany({
          data: inheritedPermissions.map((permission) => ({
            documentPolicyConfigVersionId: version.id,
            ...permission,
          })),
        })
      const updated = await tx.businessConfigurationRelease.update({
        where: { id: release.id },
        data: {
          documentPolicyConfigVersionId: version.id,
          status: "DRAFT",
          validationStatus: "NOT_VALIDATED",
          validationSnapshot: Prisma.JsonNull,
          updatedById: input.actorId,
          revision: { increment: 1 },
        },
      })
      await tx.auditEvent.create({
        data: {
          actorUserId: input.actorId,
          category: "CONFIGURATION",
          action: "document_policy.draft_saved",
          targetType: "ConfigurationVersion",
          targetId: version.id,
          configurationReleaseId: release.id,
          metadata: { manualReviewRequired: true, retentionPreferenceDays: value.retentionPreferenceDays },
        },
      })
      return { versionId: version.id, releaseRevision: updated.revision }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
}
