"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  activateDraftRelease,
  validateDraftRelease,
} from "@/lib/business-configuration/workflow-service"
import { CONFIGURATION_DOMAIN_METADATA } from "@/lib/business-configuration/domain-metadata"
import { PrismaBusinessConfigurationRepository } from "@/lib/business-configuration/prisma-repository"
import { synchronizeConfiguredBookingSteps } from "@/lib/booking-configuration/workflow"
import { updateBookingWorkflowDraft } from "@/lib/phase6-admin/service"

const ownerSetupStepSchema = z.enum([
  "business-profile",
  "rental-rules",
  "insurance",
  "booking-flow",
  "driver-rules",
  "customer-information",
  "documents",
  "payments",
  "customer-messages",
  "legal",
])

const ownerSetupStepIds = ownerSetupStepSchema.options

export type OwnerSetupStepId = z.infer<typeof ownerSetupStepSchema>

function refreshOwnerSetup() {
  revalidatePath("/admin/settings")
  revalidatePath("/admin")
}

type OwnerSetupActivationIssue = {
  code: string
  message: string
  action: string
  href: string
}

async function synchronizeCompletedSetupWorkflow(releaseId: string, actorId: string) {
  const release = await new PrismaBusinessConfigurationRepository(prisma).findReleaseAggregate(releaseId)
  if (!release) throw new Error("The completed setup release could not be loaded.")

  const workflow = release.domains["booking-workflow"]
  const insurance = release.domains.insurance
  const documents = release.domains["document-policy"]
  const legal = release.domains["legal-acceptance"]
  if (!workflow || !insurance || !documents || !legal) {
    throw new Error("The completed setup is missing required booking settings.")
  }
  const synchronized = synchronizeConfiguredBookingSteps(workflow, {
    insurance,
    documents,
    legal,
  })
  if (synchronized === workflow) return

  await updateBookingWorkflowDraft({
    actorId,
    versionId: release.versions["booking-workflow"].id,
    expectedRevision: release.versions["booking-workflow"].revision,
    configuration: synchronized,
    changeSummary: "Match booking pages to completed business settings",
  })
}

async function tryActivateCompletedSetup(actorId: string) {
  const draft = await prisma.businessConfigurationRelease.findFirst({
    where: { status: { in: ["DRAFT", "VALIDATED"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  })
  if (!draft) {
    return {
      activated: false as const,
      activationFailed: false as const,
      issues: [] as OwnerSetupActivationIssue[],
    }
  }

  try {
    await synchronizeCompletedSetupWorkflow(draft.id, actorId)
    const validation = await validateDraftRelease(draft.id, actorId)
    const blockers = validation.result.issues.filter(({ severity }) => severity === "BLOCKER")
    if (blockers.length > 0) {
      return {
        activated: false as const,
        activationFailed: false as const,
        issues: blockers.map((issue) => ({
          code: issue.code,
          message: issue.adminMessage,
          action: issue.remediation ?? "Review this setting and try again.",
          href: CONFIGURATION_DOMAIN_METADATA[issue.domain].route,
        })),
      }
    }
    const current = await prisma.businessConfigurationRelease.findUniqueOrThrow({
      where: { id: draft.id },
      select: { revision: true },
    })
    await activateDraftRelease({
      releaseId: draft.id,
      expectedRevision: current.revision,
      actorId,
      warningsAcknowledged: true,
    })
    return {
      activated: true as const,
      activationFailed: false as const,
      issues: [] as OwnerSetupActivationIssue[],
    }
  } catch (error) {
    console.error("[OWNER_SETUP_ACTIVATION_DEFERRED]", {
      name: error instanceof Error ? error.name : "Unknown",
      code: typeof error === "object" && error && "code" in error ? error.code : undefined,
    })
    return {
      activated: false as const,
      activationFailed: true as const,
      issues: [] as OwnerSetupActivationIssue[],
    }
  }
}

async function completedOwnerSetupSteps() {
  return prisma.auditEvent.findMany({
    where: {
      category: "CONFIGURATION",
      action: "owner_setup.step_completed",
      targetType: "OwnerSetupStep",
      targetId: { in: ownerSetupStepIds },
    },
    distinct: ["targetId"],
    select: { targetId: true },
  })
}

function activationError() {
  return {
    error: "Your settings were saved, but online booking could not be enabled. Please try again.",
  }
}

export async function completeOwnerSetupStepAction(input: unknown) {
  try {
    const admin = await requireAdmin()
    const stepId = ownerSetupStepSchema.parse(input)
    const existing = await prisma.auditEvent.findFirst({
      where: {
        category: "CONFIGURATION",
        action: "owner_setup.step_completed",
        targetType: "OwnerSetupStep",
        targetId: stepId,
      },
      select: { id: true },
    })
    if (!existing) {
      await prisma.auditEvent.create({
        data: {
          actorUserId: admin.id,
          category: "CONFIGURATION",
          action: "owner_setup.step_completed",
          targetType: "OwnerSetupStep",
          targetId: stepId,
        },
      })
    }
    const completedSteps = await completedOwnerSetupSteps()
    const activation = completedSteps.length === ownerSetupStepIds.length
      ? await tryActivateCompletedSetup(admin.id)
      : {
          activated: false as const,
          activationFailed: false as const,
          issues: [] as OwnerSetupActivationIssue[],
        }
    if (activation.activationFailed) return activationError()
    refreshOwnerSetup()
    return { success: true as const, activated: activation.activated }
  } catch (error) {
    console.error("[OWNER_SETUP_STEP_COMPLETE_ERROR]", error)
    return { error: "Your information was saved, but the next step could not be opened. Please return to Settings." }
  }
}

export async function recoverCompletedOwnerSetupAction() {
  try {
    const admin = await requireAdmin()
    const activeRelease = await prisma.businessConfigurationRelease.findFirst({
      where: { status: "ACTIVE" },
      select: { id: true },
    })
    if (activeRelease) return { success: true as const, activated: true as const }

    const completedSteps = await completedOwnerSetupSteps()
    if (completedSteps.length !== ownerSetupStepIds.length) {
      return { error: "Finish the remaining settings before enabling online booking." }
    }

    const activation = await tryActivateCompletedSetup(admin.id)
    if (activation.activationFailed) return activationError()
    if (!activation.activated) {
      return {
        error: activation.issues[0]?.message ?? "Review the highlighted settings before enabling online booking.",
        issues: activation.issues,
      }
    }

    refreshOwnerSetup()
    revalidatePath("/")
    return { success: true as const, activated: true as const }
  } catch (error) {
    console.error("[OWNER_SETUP_ACTIVATION_RECOVERY_ERROR]", {
      name: error instanceof Error ? error.name : "Unknown",
    })
    return activationError()
  }
}
