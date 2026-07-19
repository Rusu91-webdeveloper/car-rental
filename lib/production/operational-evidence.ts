import "server-only"

import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/db"

export const ALERT_TEST_COOLDOWN_MS = 60 * 60_000

export type EvidenceType = "ALERT_DELIVERY" | "BACKUP_VERIFICATION" | "RESTORE_VERIFICATION"
export type EvidenceStatus = "REQUESTED" | "SUCCEEDED" | "FAILED"

type RequestedEvidence = {
  type: EvidenceType
  environment: string
  operatorId: string
  deduplicationKey: string
  requestedAt: Date
  verifiedAt?: Date
  databaseFingerprint?: string
  notes?: string
  status?: EvidenceStatus
  failureCode?: string
  failureSummary?: string
}

export interface OperationalEvidenceRepository {
  create(input: RequestedEvidence): Promise<{ id: string } | "DUPLICATE">
  finish(input: {
    id: string
    status: "SUCCEEDED" | "FAILED"
    completedAt: Date
    verifiedAt?: Date
    failureCode?: string
    failureSummary?: string
    verifiedById?: string
  }): Promise<void>
  confirmAlert(input: {
    id: string
    status: "SUCCEEDED" | "FAILED"
    verifiedById: string
    completedAt: Date
    verifiedAt?: Date
    failureCode?: string
    failureSummary?: string
  }): Promise<boolean>
}

function uniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

export class PrismaOperationalEvidenceRepository implements OperationalEvidenceRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async create(input: RequestedEvidence) {
    try {
      return await this.db.operationalEvidence.create({
        data: {
          type: input.type,
          status: input.status ?? "REQUESTED",
          environment: input.environment,
          operatorId: input.operatorId,
          deduplicationKey: input.deduplicationKey,
          requestedAt: input.requestedAt,
          verifiedAt: input.verifiedAt,
          completedAt: input.status && input.status !== "REQUESTED" ? input.requestedAt : undefined,
          databaseFingerprint: input.databaseFingerprint,
          notes: input.notes,
          failureCode: input.failureCode,
          failureSummary: input.failureSummary,
        },
        select: { id: true },
      })
    } catch (error) {
      if (uniqueConstraint(error)) return "DUPLICATE" as const
      throw error
    }
  }

  async finish(input: {
    id: string
    status: "SUCCEEDED" | "FAILED"
    completedAt: Date
    verifiedAt?: Date
    failureCode?: string
    failureSummary?: string
    verifiedById?: string
  }) {
    await this.db.operationalEvidence.update({
      where: { id: input.id },
      data: {
        status: input.status,
        completedAt: input.completedAt,
        verifiedAt: input.verifiedAt,
        failureCode: input.failureCode,
        failureSummary: input.failureSummary,
        verifiedById: input.verifiedById,
      },
    })
  }

  async confirmAlert(input: {
    id: string
    status: "SUCCEEDED" | "FAILED"
    verifiedById: string
    completedAt: Date
    verifiedAt?: Date
    failureCode?: string
    failureSummary?: string
  }) {
    const result = await this.db.operationalEvidence.updateMany({
      where: { id: input.id, type: "ALERT_DELIVERY", status: "REQUESTED" },
      data: {
        status: input.status,
        verifiedById: input.verifiedById,
        completedAt: input.completedAt,
        verifiedAt: input.verifiedAt,
        failureCode: input.failureCode,
        failureSummary: input.failureSummary,
      },
    })
    return result.count === 1
  }
}

function alertWindow(now: Date) {
  return Math.floor(now.getTime() / ALERT_TEST_COOLDOWN_MS)
}

export async function verifyAlertDelivery(input: {
  operatorId: string
  environment: string
  recipient: string
  send: (input: { to: string; requestedAt: Date; environment: string }) => Promise<{ id?: string; error?: string }>
  repository?: OperationalEvidenceRepository
  now?: () => Date
}) {
  const repository = input.repository ?? new PrismaOperationalEvidenceRepository()
  const now = input.now ?? (() => new Date())
  const requestedAt = now()
  const created = await repository.create({
    type: "ALERT_DELIVERY",
    environment: input.environment,
    operatorId: input.operatorId,
    deduplicationKey: `alert:${input.environment}:${alertWindow(requestedAt)}`,
    requestedAt,
  })
  if (created === "DUPLICATE") return { status: "RATE_LIMITED" as const }

  let delivery: { id?: string; error?: string }
  try {
    delivery = await input.send({
      to: input.recipient,
      requestedAt,
      environment: input.environment,
    })
  } catch {
    delivery = { error: "ALERT_PROVIDER_EXCEPTION" }
  }
  const completedAt = now()
  if (delivery.error || !delivery.id) {
    await repository.finish({
      id: created.id,
      status: "FAILED",
      completedAt,
      failureCode: "ALERT_DELIVERY_FAILED",
      failureSummary: "The configured email provider did not confirm test delivery acceptance.",
    })
    return { status: "FAILED" as const, evidenceId: created.id }
  }
  return { status: "AWAITING_CONFIRMATION" as const, evidenceId: created.id }
}

const SAFE_OPERATIONAL_TEXT_FORBIDDEN = /(?:postgres(?:ql)?:\/\/|https?:\/\/|password\s*[:=]|secret\s*[:=]|token\s*[:=]|authorization\s*[:=])/i
const safeOperationalText = (maximum: number) =>
  z.string().trim().max(maximum).refine(
    (value) => !SAFE_OPERATIONAL_TEXT_FORBIDDEN.test(value),
    "Operational notes must not contain URLs or credential-like values.",
  )

export const alertConfirmationSchema = z.object({
  result: z.enum(["DELIVERED", "NOT_DELIVERED"]),
  notes: safeOperationalText(256).optional(),
})

export async function confirmAlertDelivery(input: {
  evidenceId: string
  operatorId: string
  body: z.infer<typeof alertConfirmationSchema>
  repository?: OperationalEvidenceRepository
  now?: () => Date
}) {
  const repository = input.repository ?? new PrismaOperationalEvidenceRepository()
  const now = input.now ?? (() => new Date())
  const completedAt = now()
  const delivered = input.body.result === "DELIVERED"
  const updated = await repository.confirmAlert({
    id: input.evidenceId,
    status: delivered ? "SUCCEEDED" : "FAILED",
    verifiedById: input.operatorId,
    completedAt,
    verifiedAt: delivered ? completedAt : undefined,
    failureCode: delivered ? undefined : "ALERT_NOT_DELIVERED",
    failureSummary: delivered ? undefined : input.body.notes ?? "The operator did not receive the test alert.",
  })
  return updated
    ? { status: delivered ? "SUCCEEDED" as const : "FAILED" as const }
    : { status: "NOT_CONFIRMABLE" as const }
}

export const recoveryEvidenceSchema = z
  .object({
    type: z.enum(["BACKUP", "RESTORE"]),
    verifiedAt: z.string().datetime({ offset: true }),
    databaseFingerprint: z.string().regex(/^[a-f0-9]{32,128}$/i),
    result: z.enum(["SUCCEEDED", "FAILED"]),
    notes: safeOperationalText(500).optional(),
    failureDetails: safeOperationalText(256).optional(),
  })
  .superRefine((value, context) => {
    if (value.result === "FAILED" && !value.failureDetails)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failureDetails"],
        message: "Failure details are required for a failed verification.",
      })
  })

export async function recordRecoveryEvidence(input: {
  body: z.infer<typeof recoveryEvidenceSchema>
  operatorId: string
  environment: string
  idempotencyKey: string
  repository?: OperationalEvidenceRepository
  now?: () => Date
}) {
  const repository = input.repository ?? new PrismaOperationalEvidenceRepository()
  const now = input.now ?? (() => new Date())
  const verifiedAt = new Date(input.body.verifiedAt)
  const requestedAt = now()
  if (verifiedAt.getTime() > requestedAt.getTime() + 60_000)
    return { status: "INVALID_FUTURE_TIMESTAMP" as const }
  const digest = createHash("sha256").update(input.idempotencyKey).digest("hex")
  const created = await repository.create({
    type: input.body.type === "BACKUP" ? "BACKUP_VERIFICATION" : "RESTORE_VERIFICATION",
    environment: input.environment,
    operatorId: input.operatorId,
    deduplicationKey: `recovery:${input.body.type.toLowerCase()}:${digest}`,
    requestedAt,
    verifiedAt,
    databaseFingerprint: input.body.databaseFingerprint.toLowerCase(),
    notes: input.body.notes,
    status: input.body.result,
    failureCode: input.body.result === "FAILED" ? "RECOVERY_VERIFICATION_FAILED" : undefined,
    failureSummary: input.body.result === "FAILED" ? input.body.failureDetails : undefined,
  })
  if (created === "DUPLICATE") return { status: "DUPLICATE" as const }
  return { status: input.body.result, evidenceId: created.id }
}
