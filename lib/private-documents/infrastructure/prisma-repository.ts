import { randomUUID } from "node:crypto";
import type {
  CustomerDocument,
  DocumentDeletionAttempt,
  DocumentDeletionRequest,
  DocumentUploadIntent,
  PrismaClient,
} from "@prisma/client";
import { documentError } from "../domain/errors";
import type { SafeAuditInput } from "../domain/types";
import type { NormalizedScanResult } from "../scanning/contracts";
import type {
  DeletionRecord,
  DocumentLifecycleRepository,
  DocumentRecord,
  IntentRecord,
  LegalHoldRecord,
  PolicyRecord,
  SessionRecord,
} from "../application/repository";

const objectFrom = (row: {
  storageProviderId: string;
  storageRegion: string;
  storageContainerId: string | null;
  storageKey: string;
  storageObjectVersionId?: string | null;
  providerObjectVersionId?: string | null;
  quarantineStatus?: string | null;
}) => ({
  providerKey: row.storageProviderId,
  region: row.storageRegion,
  containerId: row.storageContainerId ?? "",
  objectKey: row.storageKey,
  versionId:
    row.storageObjectVersionId ?? row.providerObjectVersionId ?? undefined,
  namespace:
    row.quarantineStatus === "RELEASED"
      ? ("approved" as const)
      : ("quarantine" as const),
});

export class PrismaDocumentLifecycleRepository implements DocumentLifecycleRepository {
  constructor(private readonly db: PrismaClient) {}
  async resolveActivePolicy(): Promise<PolicyRecord | undefined> {
    const release = await this.db.businessConfigurationRelease.findFirst({
      where: { status: "ACTIVE" },
      include: {
        documentPolicyConfig: {
          include: { requirements: { include: { documentType: true } } },
        },
      },
    });
    if (!release) return undefined;
    return {
      configurationReleaseId: release.id,
      documentPolicyConfigVersionId: release.documentPolicyConfigVersionId,
      retentionPreferenceDays:
        release.documentPolicyConfig.retentionPreferenceDays,
      identityDocumentChoice:
        release.documentPolicyConfig.identityDocumentChoice,
      requirements: release.documentPolicyConfig.requirements.map((rule) => ({
        documentTypeId: rule.documentTypeId,
        documentTypeKey: rule.documentType
          .key as PolicyRecord["requirements"][number]["documentTypeKey"],
        mode: rule.mode,
        fileCount: rule.fileCount,
        sides: rule.sides,
        uploadStage: rule.uploadStage,
      })),
    };
  }
  private async policyFor(versionId: string) {
    const policy = await this.db.documentPolicyConfigVersion.findUnique({
      where: { configurationVersionId: versionId },
      include: {
        requirements: { include: { documentType: true } },
        releases: { where: { status: "ACTIVE" }, take: 1 },
      },
    });
    if (!policy) return undefined;
    return {
      configurationReleaseId: policy.releases[0]?.id ?? "",
      documentPolicyConfigVersionId: versionId,
      retentionPreferenceDays: policy.retentionPreferenceDays,
      identityDocumentChoice: policy.identityDocumentChoice,
      requirements: policy.requirements.map((rule) => ({
        documentTypeId: rule.documentTypeId,
        documentTypeKey: rule.documentType
          .key as PolicyRecord["requirements"][number]["documentTypeKey"],
        mode: rule.mode,
        fileCount: rule.fileCount,
        sides: rule.sides,
        uploadStage: rule.uploadStage,
      })),
    };
  }
  private async mapSession(row: {
    id: string;
    customerUserId: string;
    carId: string;
    pickupAt: Date;
    returnAt: Date;
    locale: string;
    configurationReleaseId: string;
    documentPolicyConfigVersionId: string;
    status: string;
    revision: number;
    expiresAt: Date;
    consumedAt: Date | null;
    abortedAt: Date | null;
  }) {
    const policy = await this.policyFor(row.documentPolicyConfigVersionId);
    if (!policy) return undefined;
    return {
      ...policy,
      ...row,
      status: row.status as SessionRecord["status"],
      consumedAt: row.consumedAt ?? undefined,
      abortedAt: row.abortedAt ?? undefined,
    } as SessionRecord;
  }
  async createSession(record: SessionRecord) {
    const row = await this.db.documentUploadSession.create({
      data: {
        id: record.id,
        customerUserId: record.customerUserId,
        carId: record.carId,
        pickupAt: record.pickupAt,
        returnAt: record.returnAt,
        locale: record.locale,
        configurationReleaseId: record.configurationReleaseId,
        documentPolicyConfigVersionId: record.documentPolicyConfigVersionId,
        status: record.status,
        revision: record.revision,
        expiresAt: record.expiresAt,
      },
    });
    return (await this.mapSession(row))!;
  }
  async getSession(id: string) {
    const row = await this.db.documentUploadSession.findUnique({
      where: { id },
    });
    return row ? this.mapSession(row) : undefined;
  }
  async updateSession(
    id: string,
    expectedRevision: number,
    changes: Partial<SessionRecord>,
  ) {
    const result = await this.db.documentUploadSession.updateMany({
      where: { id, revision: expectedRevision },
      data: {
        status: changes.status,
        revision: changes.revision,
        consumedAt: changes.status === "CONSUMED" ? new Date() : undefined,
        abortedAt: changes.status === "ABORTED" ? new Date() : undefined,
      },
    });
    if (result.count !== 1)
      documentError(
        "DOCUMENT_IDEMPOTENCY_CONFLICT",
        "Stale session transition.",
      );
    return (await this.getSession(id))!;
  }
  private mapIntent(row: DocumentUploadIntent): IntentRecord {
    return {
      id: row.id,
      uploadSessionId: row.uploadSessionId,
      documentPolicyConfigVersionId: row.documentPolicyConfigVersionId,
      documentTypeId: row.documentTypeId,
      side: row.side,
      slotNumber: row.slotNumber,
      attemptNumber: row.attemptNumber,
      idempotencyKey: row.idempotencyKey,
      originalFileName: row.originalFileName ?? "document",
      declaredMimeType: row.declaredMimeType,
      expectedSizeBytes: row.expectedSizeBytes,
      expectedChecksumSha256: row.expectedChecksumSha256,
      targetId: row.providerUploadId ?? row.id,
      object: { ...objectFrom(row), containerId: row.storageContainerId ?? "" },
      status: row.status,
      revision: row.revision,
      expiresAt: row.expiresAt,
      cleanupEligibleAt: row.cleanupEligibleAt,
      failureCode: row.failureCode ?? undefined,
    };
  }
  async createIntent(record: IntentRecord) {
    const row = await this.db.documentUploadIntent.create({
      data: {
        id: record.id,
        uploadSessionId: record.uploadSessionId,
        documentPolicyConfigVersionId: record.documentPolicyConfigVersionId,
        documentTypeId: record.documentTypeId,
        side: record.side,
        slotNumber: record.slotNumber,
        attemptNumber: record.attemptNumber,
        idempotencyKey: record.idempotencyKey,
        filePolicyVersion: 1,
        originalFileName: record.originalFileName,
        normalizedExtension:
          record.originalFileName.toLowerCase().match(/\.[^.]+$/)?.[0] ??
          ".jpg",
        declaredMimeType: record.declaredMimeType,
        expectedSizeBytes: record.expectedSizeBytes,
        expectedChecksumSha256: record.expectedChecksumSha256,
        storageProviderId: record.object.providerKey,
        storageRegion: record.object.region,
        storageContainerId: record.object.containerId,
        storageKey: record.object.objectKey,
        providerUploadId: record.targetId,
        providerObjectVersionId: record.object.versionId,
        status: record.status,
        revision: record.revision,
        expiresAt: record.expiresAt,
        cleanupEligibleAt: record.cleanupEligibleAt,
      },
    });
    return this.mapIntent(row);
  }
  async getIntent(id: string) {
    const row = await this.db.documentUploadIntent.findUnique({
      where: { id },
    });
    return row ? this.mapIntent(row) : undefined;
  }
  async listSessionIntents(sessionId: string) {
    return (
      await this.db.documentUploadIntent.findMany({
        where: { uploadSessionId: sessionId },
      })
    ).map((row) => this.mapIntent(row));
  }
  async findIntentByIdempotency(key: string) {
    const row = await this.db.documentUploadIntent.findUnique({
      where: { idempotencyKey: key },
    });
    return row ? this.mapIntent(row) : undefined;
  }
  async updateIntent(
    id: string,
    expectedRevision: number,
    changes: Partial<IntentRecord>,
  ) {
    const now = new Date();
    const result = await this.db.documentUploadIntent.updateMany({
      where: { id, revision: expectedRevision },
      data: {
        status: changes.status,
        revision: changes.revision,
        failureCode: changes.failureCode,
        uploadCompletedAt: changes.status === "UPLOADED" ? now : undefined,
        verificationStartedAt: changes.status === "VERIFYING" ? now : undefined,
        completedAt:
          changes.status &&
          ["CLEAN", "REJECTED", "FAILED"].includes(changes.status)
            ? now
            : undefined,
        abortedAt: changes.status === "ABORTED" ? now : undefined,
      },
    });
    if (result.count !== 1)
      documentError(
        "DOCUMENT_IDEMPOTENCY_CONFLICT",
        "Stale intent transition.",
      );
    return (await this.getIntent(id))!;
  }
  private mapDocument(row: CustomerDocument): DocumentRecord {
    return {
      id: row.id,
      customerUserId: row.customerUserId,
      uploadedById: row.uploadedById,
      documentTypeId: row.documentTypeId,
      side: row.side,
      slotNumber: row.slotNumber!,
      attemptNumber: row.attemptNumber!,
      uploadSessionId: row.uploadSessionId!,
      uploadIntentId: row.uploadIntentId!,
      configurationReleaseId: row.configurationReleaseId!,
      documentPolicyConfigVersionId: row.documentPolicyConfigVersionId!,
      object: objectFrom(row),
      validation: {
        normalizedExtension: row.fileExtension,
        declaredMimeType: row.declaredMimeType,
        detectedMimeType: row.detectedMimeType,
        detectedFileType: row.detectedFileType,
        sizeBytes: row.sizeBytes,
        checksumSha256: row.checksumSha256,
      },
      uploadStatus: row.uploadStatus,
      scanStatus: row.scanStatus,
      scanAttemptCount: row.scanAttemptCount,
      isCurrent: row.isCurrent,
      replacesDocumentId: row.replacesDocumentId ?? undefined,
      retentionUntil: row.retentionUntil,
      deletionEligibleAt: row.deletionEligibleAt!,
      retentionBasis: row.retentionBasis!,
      legalHold: row.legalHold,
      deletionStatus: row.deletionStatus,
      deletedAt: row.deletedAt ?? undefined,
    } as DocumentRecord;
  }
  async createDocument(record: DocumentRecord) {
    const row = await this.db.customerDocument.create({
      data: {
        id: record.id,
        customerUserId: record.customerUserId,
        uploadedById: record.uploadedById,
        documentTypeId: record.documentTypeId,
        side: record.side,
        sequence: record.attemptNumber,
        storageProviderId: record.object.providerKey,
        storageRegion: record.object.region,
        storageContainerId: record.object.containerId,
        storageKey: record.object.objectKey,
        storageObjectVersionId: record.object.versionId,
        originalFileName: record.validation.normalizedExtension,
        normalizedMimeType: record.validation.detectedMimeType,
        detectedMimeType: record.validation.detectedMimeType,
        detectedFileType: record.validation.detectedFileType,
        fileExtension: record.validation.normalizedExtension,
        sizeBytes: record.validation.sizeBytes,
        checksumSha256: record.validation.checksumSha256,
        uploadStatus: record.uploadStatus,
        scanStatus: record.scanStatus,
        retentionUntil: record.retentionUntil,
        deletionStatus: record.deletionStatus,
        evidenceSchemaVersion: 2,
        uploadSessionId: record.uploadSessionId,
        uploadIntentId: record.uploadIntentId,
        configurationReleaseId: record.configurationReleaseId,
        documentPolicyConfigVersionId: record.documentPolicyConfigVersionId,
        documentRequirementTypeId: record.documentTypeId,
        slotNumber: record.slotNumber,
        attemptNumber: record.attemptNumber,
        isCurrent: record.isCurrent,
        replacesDocumentId: record.replacesDocumentId,
        declaredMimeType: record.validation.declaredMimeType,
        filePolicyVersion: 1,
        quarantineStatus: "QUARANTINED",
        quarantinedAt: new Date(),
        fileValidatorVersion: "phase8d-validator-v1",
        metadataVerifiedAt: new Date(),
        scanAttemptCount: 0,
        scanRequestedAt: new Date(),
        retentionBasis: record.retentionBasis,
        retentionBasisAt: new Date(),
        retentionPolicyDaysSnapshot: 90,
        hardRetentionDaysSnapshot: 365,
        deletionEligibleAt: record.deletionEligibleAt,
      },
    });
    return this.mapDocument(row);
  }
  async getDocument(id: string) {
    const row = await this.db.customerDocument.findUnique({ where: { id } });
    return row ? this.mapDocument(row) : undefined;
  }
  async findDocumentByIntent(intentId: string) {
    const row = await this.db.customerDocument.findUnique({
      where: { uploadIntentId: intentId },
    });
    return row ? this.mapDocument(row) : undefined;
  }
  async updateDocument(id: string, changes: Partial<DocumentRecord>) {
    const row = await this.db.customerDocument.update({
      where: { id },
      data: {
        uploadStatus: changes.uploadStatus,
        scanStatus: changes.scanStatus,
        scanAttemptCount: changes.scanAttemptCount,
        isCurrent: changes.isCurrent,
        deletionStatus: changes.deletionStatus,
        deletedAt: changes.deletedAt,
        legalHold: changes.legalHold,
        storageKey: changes.object?.objectKey,
        storageObjectVersionId: changes.object?.versionId,
        quarantineStatus:
          changes.object?.namespace === "approved" ? "RELEASED" : undefined,
        releasedFromQuarantineAt:
          changes.object?.namespace === "approved" ? new Date() : undefined,
        scanCompletedAt:
          changes.scanStatus && changes.scanStatus !== "PENDING"
            ? new Date()
            : undefined,
        scanResultCode: changes.scanStatus,
      },
    });
    return this.mapDocument(row);
  }
  async promoteReplacement(
    predecessorId: string,
    replacementId: string,
    approved: DocumentRecord["object"],
  ) {
    return this.db.$transaction(async (tx) => {
      const changed = await tx.customerDocument.updateMany({
        where: { id: predecessorId, isCurrent: true },
        data: { isCurrent: false },
      });
      if (changed.count !== 1)
        documentError(
          "DOCUMENT_IDEMPOTENCY_CONFLICT",
          "Stale predecessor promotion.",
        );
      const row = await tx.customerDocument.update({
        where: { id: replacementId },
        data: {
          isCurrent: true,
          uploadStatus: "READY",
          scanStatus: "CLEAN",
          storageKey: approved.objectKey,
          storageObjectVersionId: approved.versionId,
          quarantineStatus: "RELEASED",
          releasedFromQuarantineAt: new Date(),
          scanCompletedAt: new Date(),
          scanResultCode: "CLEAN",
        },
      });
      return this.mapDocument(row);
    });
  }
  async listSessionDocuments(sessionId: string) {
    return (
      await this.db.customerDocument.findMany({
        where: { uploadSessionId: sessionId },
      })
    ).map((row) => this.mapDocument(row));
  }
  async appendScanAttempt(documentId: string, result: NormalizedScanResult) {
    const existing = await this.db.documentMalwareScanAttempt.findUnique({
      where: {
        scannerProviderId_providerEventId: {
          scannerProviderId: "deterministic-fake-scanner",
          providerEventId: result.providerEventId,
        },
      },
    });
    if (existing)
      return { duplicate: true, attemptNumber: existing.attemptNumber };
    return this.db.$transaction(async (tx) => {
      const document = await tx.customerDocument.findUniqueOrThrow({
        where: { id: documentId },
      });
      const number = document.scanAttemptCount + 1;
      await tx.documentMalwareScanAttempt.create({
        data: {
          id: randomUUID(),
          customerDocumentId: documentId,
          attemptNumber: number,
          scannerProviderId: "deterministic-fake-scanner",
          providerReference: result.providerReference,
          providerEventId: result.providerEventId,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          outcome: result.outcome,
          safeResultCode: result.safeResultCode,
          retryable: result.retryable,
          sanitizedMetadata: result.sanitizedMetadata,
        },
      });
      await tx.customerDocument.update({
        where: { id: documentId },
        data: {
          scanAttemptCount: number,
          scanStatus: result.outcome,
          scanCompletedAt: result.completedAt,
          scanResultCode: result.safeResultCode,
        },
      });
      return { duplicate: false, attemptNumber: number };
    });
  }
  async applyHold(record: LegalHoldRecord) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.documentLegalHold.create({
        data: {
          id: record.id,
          customerDocumentId: record.customerDocumentId,
          reason: record.reason,
          appliedById: record.appliedById,
          appliedAt: record.appliedAt,
          reviewAt: record.reviewAt,
          revision: 1,
        },
      });
      await tx.customerDocument.update({
        where: { id: record.customerDocumentId },
        data: { legalHold: true },
      });
      return {
        ...row,
        reviewAt: row.reviewAt ?? undefined,
        releasedById: undefined,
        releasedAt: undefined,
        releaseReason: undefined,
      };
    });
  }
  async getActiveHold(documentId: string) {
    const row = await this.db.documentLegalHold.findFirst({
      where: { customerDocumentId: documentId, releasedAt: null },
    });
    return row
      ? {
          ...row,
          reviewAt: row.reviewAt ?? undefined,
          releasedById: row.releasedById ?? undefined,
          releasedAt: row.releasedAt ?? undefined,
          releaseReason: row.releaseReason ?? undefined,
        }
      : undefined;
  }
  async listHolds(documentId: string) {
    return (
      await this.db.documentLegalHold.findMany({
        where: { customerDocumentId: documentId },
        orderBy: { appliedAt: "asc" },
      })
    ).map((row) => ({
      ...row,
      reviewAt: row.reviewAt ?? undefined,
      releasedById: row.releasedById ?? undefined,
      releasedAt: row.releasedAt ?? undefined,
      releaseReason: row.releaseReason ?? undefined,
    }));
  }
  async releaseHold(
    id: string,
    expectedRevision: number,
    actorId: string,
    reason: string,
    at: Date,
  ) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.documentLegalHold.findUniqueOrThrow({
        where: { id },
      });
      if (current.revision !== expectedRevision)
        documentError("DOCUMENT_IDEMPOTENCY_CONFLICT", "Stale hold release.");
      const row = await tx.documentLegalHold.update({
        where: { id },
        data: {
          releasedById: actorId,
          releasedAt: at,
          releaseReason: reason,
          revision: expectedRevision + 1,
        },
      });
      await tx.customerDocument.update({
        where: { id: row.customerDocumentId },
        data: { legalHold: false },
      });
      return {
        ...row,
        reviewAt: row.reviewAt ?? undefined,
        releasedById: row.releasedById ?? undefined,
        releasedAt: row.releasedAt ?? undefined,
        releaseReason: row.releaseReason ?? undefined,
      };
    });
  }
  private mapDeletion(
    row: DocumentDeletionRequest & { attempts: DocumentDeletionAttempt[] },
  ): DeletionRecord {
    return {
      id: row.id,
      customerDocumentId: row.customerDocumentId,
      idempotencyKey: row.idempotencyKey,
      requestedById: row.requestedById ?? undefined,
      reason: row.reason,
      requestedAt: row.requestedAt,
      eligibleAt: row.eligibleAt,
      mustCompleteBy: row.mustCompleteBy,
      status: row.status,
      revision: row.revision,
      providerConfirmationRef: row.providerConfirmationRef ?? undefined,
      completedAt: row.completedAt ?? undefined,
      attempts: row.attempts.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        outcome: attempt.outcome,
        retryable: attempt.retryable,
        safeFailureCode: attempt.safeFailureCode ?? undefined,
        providerConfirmationRef: attempt.providerConfirmationRef ?? undefined,
      })),
    };
  }
  async createDeletion(record: DeletionRecord) {
    const row = await this.db.documentDeletionRequest.create({
      data: {
        id: record.id,
        customerDocumentId: record.customerDocumentId,
        idempotencyKey: record.idempotencyKey,
        requestedById: record.requestedById,
        reason: record.reason,
        requestedAt: record.requestedAt,
        eligibleAt: record.eligibleAt,
        mustCompleteBy: record.mustCompleteBy,
      },
      include: { attempts: true },
    });
    return this.mapDeletion(row);
  }
  async getDeletionByIdempotency(key: string) {
    const row = await this.db.documentDeletionRequest.findUnique({
      where: { idempotencyKey: key },
      include: { attempts: true },
    });
    return row ? this.mapDeletion(row) : undefined;
  }
  async updateDeletion(
    id: string,
    expectedRevision: number,
    changes: Partial<DeletionRecord>,
  ) {
    const result = await this.db.documentDeletionRequest.updateMany({
      where: { id, revision: expectedRevision },
      data: {
        status: changes.status,
        revision: changes.revision,
        providerConfirmationRef: changes.providerConfirmationRef,
        providerConfirmedAt:
          changes.status === "COMPLETED" ? new Date() : undefined,
        completedAt: changes.completedAt,
      },
    });
    if (result.count !== 1)
      documentError(
        "DOCUMENT_IDEMPOTENCY_CONFLICT",
        "Stale deletion transition.",
      );
    const row = await this.db.documentDeletionRequest.findUniqueOrThrow({
      where: { id },
      include: { attempts: true },
    });
    return this.mapDeletion(row);
  }
  async appendDeletionAttempt(
    id: string,
    attempt: DeletionRecord["attempts"][number],
  ) {
    await this.db.documentDeletionAttempt.create({
      data: {
        id: randomUUID(),
        deletionRequestId: id,
        attemptNumber: attempt.attemptNumber,
        storageProviderId: "local-private",
        providerRequestId: `${id}:${attempt.attemptNumber}`,
        startedAt: new Date(),
        completedAt: new Date(),
        outcome: attempt.outcome,
        retryable: attempt.retryable,
        safeFailureCode: attempt.safeFailureCode,
        providerConfirmationRef: attempt.providerConfirmationRef,
      },
    });
    const row = await this.db.documentDeletionRequest.findUniqueOrThrow({
      where: { id },
      include: { attempts: true },
    });
    return this.mapDeletion(row);
  }
  async audit(input: SafeAuditInput) {
    await this.db.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        category: "DOCUMENT",
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        configurationReleaseId: input.configurationReleaseId,
        customerDocumentId: input.customerDocumentId,
        correlationId: input.correlationId,
        metadata: input.metadata,
      },
    });
  }
  async listAudits() {
    const rows = await this.db.auditEvent.findMany({
      where: { category: "DOCUMENT" },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      actorUserId: row.actorUserId ?? undefined,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      configurationReleaseId: row.configurationReleaseId ?? undefined,
      customerDocumentId: row.customerDocumentId ?? undefined,
      correlationId: row.correlationId ?? undefined,
      metadata: row.metadata as SafeAuditInput["metadata"],
    }));
  }
  async findExpiredSessions(now: Date, limit: number) {
    const rows = await this.db.documentUploadSession.findMany({
      where: { status: "OPEN", expiresAt: { lte: now } },
      take: limit,
      orderBy: { expiresAt: "asc" },
    });
    return (await Promise.all(rows.map((row) => this.mapSession(row)))).filter(
      (value): value is SessionRecord => Boolean(value),
    );
  }
  async findDueDocuments(now: Date, limit: number) {
    return (
      await this.db.customerDocument.findMany({
        where: {
          deletionStatus: { in: ["RETAINED", "FAILED"] },
          legalHold: false,
          deletionEligibleAt: { lte: now },
        },
        take: limit,
        orderBy: { deletionEligibleAt: "asc" },
      })
    ).map((row) => this.mapDocument(row));
  }
  async findRetryableScanDocuments(limit: number, maximumAttempts: number) {
    return (
      await this.db.customerDocument.findMany({
        where: {
          uploadStatus: "VERIFYING",
          scanStatus: { in: ["ERROR", "TIMEOUT"] },
          scanAttemptCount: { lt: maximumAttempts },
          deletionStatus: { not: "DELETED" },
        },
        take: Math.min(limit, 50),
        orderBy: { updatedAt: "asc" },
      })
    ).map((row) => this.mapDocument(row));
  }
}
