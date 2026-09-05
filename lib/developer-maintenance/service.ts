import "server-only"

import {
  AdminAction,
  AuditCategory,
  type Prisma,
  type PrismaClient,
} from "@prisma/client"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { prisma } from "@/lib/db"
import { DocumentCleanupService } from "@/lib/private-documents/application/cleanup-service"
import { DocumentDeletionService } from "@/lib/private-documents/application/deletion-service"
import type { RecentAuthenticationEvidence } from "@/lib/private-documents/authorization/recent-auth"
import { ServerSessionRecentAuthenticationVerifier } from "@/lib/private-documents/authorization/recent-auth"
import type { DocumentActor } from "@/lib/private-documents/domain/types"
import { PrismaDocumentLifecycleRepository } from "@/lib/private-documents/infrastructure/prisma-repository"
import { readRuntimePrivateDocumentEnvironment } from "@/lib/private-documents/infrastructure/runtime-environment"
import { createPrivateDocumentStorage } from "@/lib/private-documents/storage/factory"

const DAY = 86_400_000
export const DEVELOPER_MAINTENANCE_POLICY = {
  auditEventRetentionDays: 365,
  adminAuditLogRetentionDays: 365,
  workerExecutionRetentionDays: 90,
  documentBatchSize: 10,
  documentMaximumAttemptsPerRequest: 3,
  logBatchSize: 1_000,
  uploadCleanupBatchSize: 50,
} as const

export interface DeveloperMaintenancePreview {
  generatedAt: string
  dueDocuments: number
  dueDocumentBytes: number
  expiredUploadSessions: number
  oldAuditEvents: number
  oldAdminAuditLogs: number
  oldWorkerExecutions: number
  policy: typeof DEVELOPER_MAINTENANCE_POLICY
}

function cutoffs(now: Date) {
  return {
    auditEvents: new Date(now.getTime() - DEVELOPER_MAINTENANCE_POLICY.auditEventRetentionDays * DAY),
    adminAuditLogs: new Date(now.getTime() - DEVELOPER_MAINTENANCE_POLICY.adminAuditLogRetentionDays * DAY),
    workerExecutions: new Date(now.getTime() - DEVELOPER_MAINTENANCE_POLICY.workerExecutionRetentionDays * DAY),
  }
}

const dueDocumentWhere = (now: Date): Prisma.CustomerDocumentWhereInput => ({
  deletionStatus: { in: ["RETAINED", "SCHEDULED", "FAILED"] },
  legalHold: false,
  deletionEligibleAt: { lte: now },
})

const oldAuditEventWhere = (
  cutoff: Date,
): Prisma.AuditEventWhereInput => ({
  createdAt: { lt: cutoff },
  OR: [
    { customerDocumentId: null },
    { customerDocument: { legalHold: false } },
  ],
})

export async function getDeveloperMaintenancePreview(
  db: PrismaClient = prisma,
  now = new Date(),
): Promise<DeveloperMaintenancePreview> {
  const cutoff = cutoffs(now)
  const [
    dueDocuments,
    dueDocumentBytes,
    expiredUploadSessions,
    oldAuditEvents,
    oldAdminAuditLogs,
    oldWorkerExecutions,
  ] = await Promise.all([
    db.customerDocument.count({ where: dueDocumentWhere(now) }),
    db.customerDocument.aggregate({
      where: dueDocumentWhere(now),
      _sum: { sizeBytes: true },
    }),
    db.documentUploadSession.count({
      where: { status: "OPEN", expiresAt: { lte: now } },
    }),
    db.auditEvent.count({ where: oldAuditEventWhere(cutoff.auditEvents) }),
    db.adminAuditLog.count({ where: { createdAt: { lt: cutoff.adminAuditLogs } } }),
    db.workerExecution.count({ where: { startedAt: { lt: cutoff.workerExecutions } } }),
  ])
  return {
    generatedAt: now.toISOString(),
    dueDocuments,
    dueDocumentBytes: dueDocumentBytes._sum?.sizeBytes ?? 0,
    expiredUploadSessions,
    oldAuditEvents,
    oldAdminAuditLogs,
    oldWorkerExecutions,
    policy: DEVELOPER_MAINTENANCE_POLICY,
  }
}

async function pruneOldLogs(db: PrismaClient, now: Date, developerId: string) {
  const cutoff = cutoffs(now)
  const [auditRows, adminRows, workerRows] = await Promise.all([
    db.auditEvent.findMany({
      where: oldAuditEventWhere(cutoff.auditEvents),
      orderBy: { createdAt: "asc" },
      take: DEVELOPER_MAINTENANCE_POLICY.logBatchSize,
      select: { id: true },
    }),
    db.adminAuditLog.findMany({
      where: { createdAt: { lt: cutoff.adminAuditLogs } },
      orderBy: { createdAt: "asc" },
      take: DEVELOPER_MAINTENANCE_POLICY.logBatchSize,
      select: { id: true },
    }),
    db.workerExecution.findMany({
      where: { startedAt: { lt: cutoff.workerExecutions } },
      orderBy: { startedAt: "asc" },
      take: DEVELOPER_MAINTENANCE_POLICY.logBatchSize,
      select: { id: true },
    }),
  ])
  const [auditEvents, adminAuditLogs, workerExecutions] = await db.$transaction([
    db.auditEvent.deleteMany({ where: { id: { in: auditRows.map(({ id }) => id) } } }),
    db.adminAuditLog.deleteMany({ where: { id: { in: adminRows.map(({ id }) => id) } } }),
    db.workerExecution.deleteMany({ where: { id: { in: workerRows.map(({ id }) => id) } } }),
    db.adminAuditLog.create({
      data: {
        adminId: developerId,
        action: AdminAction.MAINTENANCE_CLEANUP,
        targetType: "system_maintenance",
        targetId: `maintenance-${now.toISOString()}`,
        reason: "Developer-only retention cleanup.",
        newValue: {
          selectedAuditEvents: auditRows.length,
          selectedAdminAuditLogs: adminRows.length,
          selectedWorkerExecutions: workerRows.length,
          cutoffs: {
            auditEvents: cutoff.auditEvents.toISOString(),
            adminAuditLogs: cutoff.adminAuditLogs.toISOString(),
            workerExecutions: cutoff.workerExecutions.toISOString(),
          },
        },
      },
    }),
  ])
  return {
    auditEvents: auditEvents.count,
    adminAuditLogs: adminAuditLogs.count,
    workerExecutions: workerExecutions.count,
  }
}

export async function runDeveloperMaintenanceCleanup(input: {
  developerId: string
  recentAuthenticationEvidence: RecentAuthenticationEvidence
  db?: PrismaClient
  now?: Date
}) {
  const db = input.db ?? prisma
  const now = input.now ?? new Date()
  const environment = await readRuntimePrivateDocumentEnvironment()
  const repository = new PrismaDocumentLifecycleRepository(db)
  const storage = createPrivateDocumentStorage({
    environment,
    localRoot: process.env.PRIVATE_DOCUMENT_LOCAL_ROOT ?? "/tmp/car-rental-private-documents",
  })
  const deletion = new DocumentDeletionService(
    repository,
    storage,
    new ServerSessionRecentAuthenticationVerifier(() => now),
    () => now,
    DEVELOPER_MAINTENANCE_POLICY.documentMaximumAttemptsPerRequest,
    environment.recentAuthMaximumAgeSeconds * 1_000,
  )
  const cleanup = new DocumentCleanupService(repository, storage, deletion, async () => {
    throw new Error("Scanner retry is not part of developer maintenance.")
  })
  const actor: DocumentActor = {
    userId: input.developerId,
    role: "ADMIN",
    capabilities: new Set([CAPABILITIES.DOCUMENTS_DELETE]),
    assignedRoleKeys: new Set(["DOCUMENT_DEVELOPER_MAINTENANCE"]),
  }
  const permission = {
    mayView: false,
    mayDownload: false,
    mayDelete: true,
    mayManageLegalHold: false,
  }
  const documents = await db.customerDocument.findMany({
    where: dueDocumentWhere(now),
    orderBy: [{ deletionEligibleAt: "asc" }, { id: "asc" }],
    take: DEVELOPER_MAINTENANCE_POLICY.documentBatchSize,
    select: {
      id: true,
      deletionEligibleAt: true,
      deletionRequests: {
        where: { status: { in: ["SCHEDULED", "IN_PROGRESS", "FAILED"] } },
        orderBy: { requestedAt: "desc" },
        take: 1,
        select: {
          id: true,
          idempotencyKey: true,
          _count: { select: { attempts: true } },
        },
      },
    },
  })
  let deletedDocuments = 0
  const documentFailures: Array<{ id: string; code: string }> = []
  for (const document of documents) {
    const existingRequest = document.deletionRequests[0]
    const retryableRequest =
      existingRequest &&
      existingRequest._count.attempts <
        DEVELOPER_MAINTENANCE_POLICY.documentMaximumAttemptsPerRequest
    const idempotencyKey =
      retryableRequest
        ? existingRequest.idempotencyKey
        : `developer-retention:${document.id}:${existingRequest?.id ?? document.deletionEligibleAt?.getTime() ?? 0}`
    try {
      if (!retryableRequest)
        await deletion.request({
          documentId: document.id,
          idempotencyKey,
          actor,
          permission,
          evidence: input.recentAuthenticationEvidence,
          reason: "Retention elapsed; developer maintenance cleanup.",
        })
      const result = await deletion.process({ idempotencyKey })
      if (result.status === "COMPLETED") deletedDocuments += 1
      else documentFailures.push({ id: document.id, code: "PROVIDER_DELETE_FAILED" })
    } catch (error) {
      documentFailures.push({
        id: document.id,
        code: error instanceof Error ? error.name : "DOCUMENT_DELETE_FAILED",
      })
    }
  }
  const abandonedObjects = await cleanup.cleanupAbandonedUploadObjects(
    DEVELOPER_MAINTENANCE_POLICY.uploadCleanupBatchSize,
  )
  const expiredSessions = await cleanup.expireUploadSessions(
    DEVELOPER_MAINTENANCE_POLICY.uploadCleanupBatchSize,
  )
  const logs = await pruneOldLogs(db, now, input.developerId)
  await db.auditEvent.create({
    data: {
      actorUserId: input.developerId,
      category: AuditCategory.SYSTEM,
      action: "developer.maintenance_cleanup_completed",
      targetType: "SystemMaintenance",
      targetId: `maintenance-${now.toISOString()}`,
      metadata: {
        deletedDocuments,
        failedDocuments: documentFailures.length,
        abandonedObjectsCleaned: abandonedObjects.succeeded,
        expiredSessions: expiredSessions.succeeded,
        deletedAuditEvents: logs.auditEvents,
        deletedAdminAuditLogs: logs.adminAuditLogs,
        deletedWorkerExecutions: logs.workerExecutions,
      },
    },
  })
  return {
    deletedDocuments,
    documentFailures,
    abandonedObjects,
    expiredSessions,
    deletedLogs: logs,
    remaining: await getDeveloperMaintenancePreview(db, new Date()),
  }
}
