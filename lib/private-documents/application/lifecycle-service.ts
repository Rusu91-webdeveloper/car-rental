import { randomUUID } from "node:crypto";
import { documentError, PrivateDocumentError } from "../domain/errors";
import { DOCUMENT_FILE_POLICY, type ScanOutcome } from "../domain/types";
import type { MalwareScanner } from "../scanning/contracts";
import type { PrivateDocumentStorage } from "../storage/contracts";
import { calculateRetention } from "../retention/calculator";
import { validateDocumentFile } from "./file-validation";
import type {
  DocumentLifecycleRepository,
  IntentRecord,
  SessionRecord,
} from "./repository";

const HOUR = 3_600_000;
const TERMINAL_INTENTS = new Set([
  "CLEAN",
  "TECHNICALLY_VALID",
  "REJECTED",
  "FAILED",
  "ABORTED",
  "EXPIRED",
]);

export class PrivateDocumentLifecycleService {
  constructor(
    private readonly repository: DocumentLifecycleRepository,
    private readonly storage: PrivateDocumentStorage,
    private readonly scanner: MalwareScanner,
    private readonly now: () => Date = () => new Date(),
    private readonly maximumScanAttempts = 3,
    private readonly processingMode:
      | "MANUAL_REVIEW"
      | "AUTOMATED_SCANNER" = "AUTOMATED_SCANNER",
  ) {}

  async createDocumentUploadSession(input: {
    customerUserId: string;
    carId: string;
    pickupAt: Date;
    returnAt: Date;
    locale: string;
    expiresInMs?: number;
  }) {
    const policy = await this.repository.resolveActivePolicy();
    if (!policy)
      documentError(
        "DOCUMENT_INVALID_PROVENANCE",
        "No active document policy is available.",
      );
    if (input.pickupAt >= input.returnAt)
      documentError("DOCUMENT_INTENT_MISMATCH", "Rental dates are invalid.");
    const session: SessionRecord = {
      ...policy,
      id: randomUUID(),
      ...input,
      status: "OPEN",
      revision: 1,
      expiresAt: new Date(this.now().getTime() + (input.expiresInMs ?? HOUR)),
    };
    await this.repository.createSession(session);
    await this.repository.audit({
      actorUserId: input.customerUserId,
      action: "document.upload_session_created",
      targetType: "DocumentUploadSession",
      targetId: session.id,
      configurationReleaseId: policy.configurationReleaseId,
    });
    return session;
  }

  private async openOwnedSession(sessionId: string, customerUserId: string) {
    const session = await this.repository.getSession(sessionId);
    if (!session)
      documentError("DOCUMENT_SESSION_NOT_FOUND", "Upload session not found.");
    if (session.customerUserId !== customerUserId)
      documentError(
        "DOCUMENT_INTENT_MISMATCH",
        "Upload session belongs to another customer.",
      );
    if (session.status === "ABORTED")
      documentError("DOCUMENT_SESSION_ABORTED", "Upload session is aborted.");
    if (session.status === "CONSUMED")
      documentError(
        "DOCUMENT_SESSION_ALREADY_COMPLETED",
        "Upload session is consumed.",
      );
    if (session.status === "EXPIRED" || session.expiresAt <= this.now())
      documentError("DOCUMENT_SESSION_EXPIRED", "Upload session is expired.");
    return session;
  }

  async createDocumentUploadIntent(input: {
    sessionId: string;
    customerUserId: string;
    documentTypeId: string;
    side: "SINGLE" | "FRONT" | "BACK";
    slotNumber: number;
    originalFileName: string;
    declaredMimeType: string;
    expectedSizeBytes: number;
    expectedChecksumSha256: string;
    idempotencyKey: string;
    replacesDocumentId?: string;
  }) {
    const session = await this.openOwnedSession(
      input.sessionId,
      input.customerUserId,
    );
    const existing = await this.repository.findIntentByIdempotency(
      input.idempotencyKey,
    );
    if (existing) {
      const same =
        existing.uploadSessionId === input.sessionId &&
        existing.documentTypeId === input.documentTypeId &&
        existing.side === input.side &&
        existing.slotNumber === input.slotNumber &&
        existing.expectedChecksumSha256 === input.expectedChecksumSha256;
      if (!same)
        documentError(
          "DOCUMENT_IDEMPOTENCY_CONFLICT",
          "Intent idempotency key was reused inconsistently.",
        );
      const extension = existing.originalFileName
        .toLowerCase()
        .match(/\.(pdf|jpe?g|png)$/)?.[0] as
        | ".pdf"
        | ".jpg"
        | ".jpeg"
        | ".png"
        | undefined;
      if (!extension)
        documentError(
          "DOCUMENT_EXTENSION_UNSUPPORTED",
          "Stored intent extension is unsupported.",
        );
      return {
        intent: existing,
        uploadTarget: await this.storage.createUploadTarget({
          uploadIntentId: existing.id,
          normalizedExtension: extension,
          declaredMimeType: existing.declaredMimeType as
            | "application/pdf"
            | "image/jpeg"
            | "image/png",
          maximumBytes: DOCUMENT_FILE_POLICY.maximumBytes,
          expectedChecksumSha256: existing.expectedChecksumSha256,
          expiresAt: existing.expiresAt,
          existing: { targetId: existing.targetId, object: existing.object },
        }),
      };
    }
    const sessionIntents = await this.repository.listSessionIntents(session.id);
    const resumable = sessionIntents
      .filter(
        (value) =>
          value.documentTypeId === input.documentTypeId &&
          value.side === input.side &&
          value.slotNumber === input.slotNumber &&
          value.expectedSizeBytes === input.expectedSizeBytes &&
          value.expectedChecksumSha256 === input.expectedChecksumSha256 &&
          ["INTENT_CREATED", "UPLOADING", "UPLOADED", "VERIFYING", "QUARANTINED"].includes(value.status),
      )
      .sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
    if (resumable) {
      const extension = resumable.originalFileName
        .toLowerCase()
        .match(/\.(pdf|jpe?g|png)$/)?.[0] as
        | ".pdf"
        | ".jpg"
        | ".jpeg"
        | ".png"
        | undefined;
      if (!extension)
        documentError(
          "DOCUMENT_EXTENSION_UNSUPPORTED",
          "Stored intent extension is unsupported.",
        );
      return {
        intent: resumable,
        uploadTarget: await this.storage.createUploadTarget({
          uploadIntentId: resumable.id,
          normalizedExtension: extension,
          declaredMimeType: resumable.declaredMimeType as
            | "application/pdf"
            | "image/jpeg"
            | "image/png",
          maximumBytes: DOCUMENT_FILE_POLICY.maximumBytes,
          expectedChecksumSha256: resumable.expectedChecksumSha256,
          expiresAt: resumable.expiresAt,
          existing: { targetId: resumable.targetId, object: resumable.object },
        }),
      };
    }
    const rule = session.requirements.find(
      (value) =>
        value.documentTypeId === input.documentTypeId &&
        value.mode !== "DISABLED",
    );
    if (
      !rule ||
      input.slotNumber < 1 ||
      input.slotNumber > rule.fileCount ||
      (rule.sides === "SINGLE_FILE"
        ? input.side !== "SINGLE"
        : !["FRONT", "BACK"].includes(input.side))
    )
      documentError(
        "DOCUMENT_INTENT_MISMATCH",
        "Document requirement slot or side is invalid.",
      );
    if (
      input.expectedSizeBytes < 1 ||
      input.expectedSizeBytes > DOCUMENT_FILE_POLICY.maximumBytes ||
      !/^[a-f0-9]{64}$/.test(input.expectedChecksumSha256)
    )
      documentError(
        "DOCUMENT_UPLOAD_METADATA_MISMATCH",
        "Expected upload metadata is invalid.",
      );
    const documents = await this.repository.listSessionDocuments(session.id);
    const attemptNumber =
      Math.max(
        0,
        ...documents
          .filter(
            (value) =>
              value.documentTypeId === input.documentTypeId &&
              value.side === input.side &&
              value.slotNumber === input.slotNumber,
          )
          .map((value) => value.attemptNumber),
        ...sessionIntents
          .filter(
            (value) =>
              value.documentTypeId === input.documentTypeId &&
              value.side === input.side &&
              value.slotNumber === input.slotNumber,
          )
          .map((value) => value.attemptNumber),
      ) + 1;
    if (input.replacesDocumentId) {
      const prior = await this.repository.getDocument(input.replacesDocumentId);
      if (
        !prior ||
        !prior.isCurrent ||
        prior.uploadSessionId !== session.id ||
        prior.documentTypeId !== input.documentTypeId ||
        prior.side !== input.side ||
        prior.slotNumber !== input.slotNumber
      )
        documentError(
          "DOCUMENT_INTENT_MISMATCH",
          "Replacement predecessor is stale or mismatched.",
        );
    }
    const intentId = randomUUID();
    const extension = input.originalFileName
      .toLowerCase()
      .match(/\.(pdf|jpe?g|png)$/)?.[0] as
      | ".pdf"
      | ".jpg"
      | ".jpeg"
      | ".png"
      | undefined;
    if (!extension)
      documentError(
        "DOCUMENT_EXTENSION_UNSUPPORTED",
        "Upload extension is unsupported.",
      );
    const target = await this.storage.createUploadTarget({
      uploadIntentId: intentId,
      normalizedExtension: extension,
      declaredMimeType: input.declaredMimeType as
        | "application/pdf"
        | "image/jpeg"
        | "image/png",
      maximumBytes: DOCUMENT_FILE_POLICY.maximumBytes,
      expectedChecksumSha256: input.expectedChecksumSha256,
      expiresAt: session.expiresAt,
    });
    const intent: IntentRecord = {
      id: intentId,
      uploadSessionId: session.id,
      documentPolicyConfigVersionId: session.documentPolicyConfigVersionId,
      documentTypeId: input.documentTypeId,
      side: input.side,
      slotNumber: input.slotNumber,
      attemptNumber,
      idempotencyKey: input.idempotencyKey,
      originalFileName: input.originalFileName,
      declaredMimeType: input.declaredMimeType,
      expectedSizeBytes: input.expectedSizeBytes,
      expectedChecksumSha256: input.expectedChecksumSha256,
      targetId: target.targetId,
      object: target.object,
      status: "INTENT_CREATED",
      revision: 1,
      expiresAt: session.expiresAt,
      cleanupEligibleAt: new Date(session.expiresAt.getTime() + HOUR),
      replacesDocumentId: input.replacesDocumentId,
    };
    try {
      await this.repository.createIntent(intent);
    } catch (error) {
      await this.storage.abortUpload({
        targetId: target.targetId,
        object: target.object,
      });
      throw error;
    }
    await this.repository.audit({
      actorUserId: input.customerUserId,
      action: input.replacesDocumentId
        ? "document.replacement_requested"
        : "document.upload_intent_created",
      targetType: "DocumentUploadIntent",
      targetId: intent.id,
      configurationReleaseId: session.configurationReleaseId,
      metadata: {
        documentTypeId: intent.documentTypeId,
        side: intent.side,
        slotNumber: intent.slotNumber,
        attemptNumber,
      },
    });
    return { intent, uploadTarget: target };
  }

  async stageDisposableUpload(
    intentId: string,
    customerUserId: string,
    bytes: Uint8Array,
  ) {
    const intent = await this.repository.getIntent(intentId);
    if (!intent)
      documentError("DOCUMENT_INTENT_NOT_FOUND", "Intent not found.");
    await this.openOwnedSession(intent.uploadSessionId, customerUserId);
    return this.storage.completeStagedUpload(intent.targetId, bytes);
  }

  async completeDocumentUpload(input: {
    intentId: string;
    customerUserId: string;
    scanDirective?: ScanOutcome;
  }) {
    let intent = await this.repository.getIntent(input.intentId);
    if (!intent)
      documentError("DOCUMENT_INTENT_NOT_FOUND", "Intent not found.");
    const session = await this.openOwnedSession(
      intent.uploadSessionId,
      input.customerUserId,
    );
    const existing = await this.repository.findDocumentByIntent(intent.id);
    if (existing && TERMINAL_INTENTS.has(intent.status)) return existing;
    const metadata = await this.storage.inspectObject(intent.object);
    if (!metadata)
      documentError(
        "DOCUMENT_UPLOAD_INCOMPLETE",
        "Uploaded object is missing.",
      );
    if (
      metadata.sizeBytes !== intent.expectedSizeBytes ||
      (metadata.checksumSha256 &&
        metadata.checksumSha256 !== intent.expectedChecksumSha256) ||
      (metadata.declaredContentType &&
        metadata.declaredContentType !== intent.declaredMimeType)
    )
      documentError(
        "DOCUMENT_UPLOAD_METADATA_MISMATCH",
        "Stored metadata differs from the upload intent.",
      );
    await this.repository.audit({
      actorUserId: input.customerUserId,
      action: "document.upload_completed",
      targetType: "DocumentUploadIntent",
      targetId: intent.id,
      configurationReleaseId: session.configurationReleaseId,
      metadata: { sizeBytes: metadata.sizeBytes },
    });
    const bytes = await this.storage.readObjectForVerification(
      intent.object,
      DOCUMENT_FILE_POLICY.maximumBytes,
    );
    let validation;
    try {
      validation = validateDocumentFile({
        originalFileName: intent.originalFileName,
        declaredMimeType: intent.declaredMimeType,
        bytes,
        expectedChecksumSha256: intent.expectedChecksumSha256,
      });
    } catch (error) {
      await this.repository.audit({
        actorUserId: input.customerUserId,
        action: "document.object_verification_failed",
        targetType: "DocumentUploadIntent",
        targetId: intent.id,
        configurationReleaseId: session.configurationReleaseId,
        metadata: {
          code:
            error instanceof PrivateDocumentError
              ? error.code
              : "DOCUMENT_PROVIDER_OPERATION_FAILED",
        },
      });
      throw error;
    }
    const uploadPath: IntentRecord["status"][] = [
      "INTENT_CREATED",
      "UPLOADING",
      "UPLOADED",
      "VERIFYING",
      "QUARANTINED",
      this.processingMode === "MANUAL_REVIEW"
        ? "TECHNICALLY_VALID"
        : "SCAN_PENDING",
    ];
    const currentIndex = uploadPath.indexOf(intent.status);
    if (currentIndex < 0)
      documentError(
        "DOCUMENT_SESSION_ALREADY_COMPLETED",
        "Intent is not completable.",
      );
    for (const status of uploadPath.slice(currentIndex + 1))
      intent = await this.repository.updateIntent(intent.id, intent.revision, {
        status,
        revision: intent.revision + 1,
      });
    const retention = calculateRetention({
      basis: "UPLOAD_SESSION_EXPIRY",
      basisAt: this.now(),
      requestedDays: session.retentionPreferenceDays,
      sessionExpiresAt: session.expiresAt,
    });
    await this.repository.audit({
      action: "document.retention_deadline_calculated",
      targetType: "DocumentUploadIntent",
      targetId: intent.id,
      configurationReleaseId: session.configurationReleaseId,
      metadata: {
        basis: retention.basis,
        deletionEligibleAt: retention.deletionEligibleAt.toISOString(),
        policyDaysSnapshot: retention.policyDaysSnapshot,
      },
    });
    let document =
      existing ??
      (await this.repository.createDocument({
        id: randomUUID(),
        customerUserId: session.customerUserId,
        uploadedById: input.customerUserId,
        documentTypeId: intent.documentTypeId,
        side: intent.side,
        slotNumber: intent.slotNumber,
        attemptNumber: intent.attemptNumber,
        uploadSessionId: session.id,
        uploadIntentId: intent.id,
        configurationReleaseId: session.configurationReleaseId,
        documentPolicyConfigVersionId: session.documentPolicyConfigVersionId,
        object: intent.object,
        validation,
        uploadStatus:
          this.processingMode === "MANUAL_REVIEW"
            ? "TECHNICALLY_VALID"
            : "VERIFYING",
        scanStatus:
          this.processingMode === "MANUAL_REVIEW"
            ? "NOT_AVAILABLE"
            : "PENDING",
        scanAttemptCount: 0,
        manualReviewStatus:
          this.processingMode === "MANUAL_REVIEW"
            ? "PENDING_REVIEW"
            : "NOT_READY",
        reviewRevision: 0,
        isCurrent: !intent.replacesDocumentId,
        replacesDocumentId: intent.replacesDocumentId,
        retentionUntil: retention.retentionUntil,
        deletionEligibleAt: retention.deletionEligibleAt,
        retentionBasis: retention.basis,
        legalHold: false,
        deletionStatus: "RETAINED",
      }));
    await this.repository.audit({
      actorUserId: input.customerUserId,
      action: "document.object_verification_passed",
      targetType: "CustomerDocument",
      targetId: document.id,
      customerDocumentId: document.id,
      configurationReleaseId: session.configurationReleaseId,
      metadata: {
        sizeBytes: validation.sizeBytes,
        detectedFileType: validation.detectedFileType,
      },
    });
    if (this.processingMode === "MANUAL_REVIEW") {
      await this.repository.audit({
        actorUserId: input.customerUserId,
        action: intent.replacesDocumentId
          ? "document.replacement_uploaded"
          : "document.entered_pending_review",
        targetType: "CustomerDocument",
        targetId: document.id,
        customerDocumentId: document.id,
        configurationReleaseId: session.configurationReleaseId,
        metadata: {
          technicalValidation: "PASSED",
          manualReviewStatus: "PENDING_REVIEW",
        },
      });
      return document;
    }
    const request = await this.scanner.requestScan({
      idempotencyKey: `scan:${document.id}:${document.scanAttemptCount + 1}`,
      object: intent.object,
      checksumSha256: validation.checksumSha256,
      testDirective: input.scanDirective,
    });
    await this.repository.audit({
      action: "document.scan_requested",
      targetType: "CustomerDocument",
      targetId: document.id,
      customerDocumentId: document.id,
      configurationReleaseId: session.configurationReleaseId,
    });
    const result = await this.scanner.processScanResult(request.requestId);
    const attempt = await this.repository.appendScanAttempt(
      document.id,
      result,
    );
    if (attempt.duplicate)
      return (await this.repository.getDocument(document.id))!;
    await this.repository.audit({
      action: "document.scan_completed",
      targetType: "CustomerDocument",
      targetId: document.id,
      customerDocumentId: document.id,
      configurationReleaseId: session.configurationReleaseId,
      metadata: {
        outcome: result.outcome,
        attemptNumber: attempt.attemptNumber,
        retryable: result.retryable,
      },
    });
    if (result.outcome === "CLEAN") {
      const approved = await this.storage.markApproved(intent.object);
      intent = await this.repository.updateIntent(intent.id, intent.revision, {
        status: "CLEAN",
        revision: intent.revision + 1,
      });
      document = intent.replacesDocumentId
        ? await this.repository.promoteReplacement(
            intent.replacesDocumentId,
            document.id,
            approved,
          )
        : await this.repository.updateDocument(document.id, {
            uploadStatus: "READY",
            scanStatus: "CLEAN",
            object: approved,
            isCurrent: true,
          });
      await this.repository.audit({
        action: intent.replacesDocumentId
          ? "document.replacement_completed"
          : "document.became_clean",
        targetType: "CustomerDocument",
        targetId: document.id,
        customerDocumentId: document.id,
        configurationReleaseId: session.configurationReleaseId,
      });
      return document;
    }
    const retryable =
      result.outcome === "ERROR" || result.outcome === "TIMEOUT";
    if (retryable && attempt.attemptNumber < this.maximumScanAttempts) {
      document = await this.repository.updateDocument(document.id, {
        uploadStatus: "VERIFYING",
        scanStatus: result.outcome,
      });
      await this.repository.audit({
        action: "document.scan_failed",
        targetType: "CustomerDocument",
        targetId: document.id,
        customerDocumentId: document.id,
        configurationReleaseId: session.configurationReleaseId,
        metadata: {
          attemptNumber: attempt.attemptNumber,
          retryable: true,
        },
      });
      return document;
    }
    const failed = retryable;
    intent = await this.repository.updateIntent(intent.id, intent.revision, {
      status: failed ? "FAILED" : "REJECTED",
      failureCode: result.safeResultCode,
      revision: intent.revision + 1,
    });
    document = await this.repository.updateDocument(document.id, {
      uploadStatus: failed ? "FAILED" : "REJECTED",
      scanStatus: result.outcome,
    });
    await this.repository.audit({
      action: failed ? "document.scan_failed" : "document.rejected",
      targetType: "CustomerDocument",
      targetId: document.id,
      customerDocumentId: document.id,
      configurationReleaseId: session.configurationReleaseId,
      metadata: { outcome: result.outcome, retryable: result.retryable },
    });
    return document;
  }

  async retryFailedDocumentScan(documentId: string) {
    const document = await this.repository.getDocument(documentId);
    if (!document)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Document not found.");
    if (
      document.uploadStatus !== "VERIFYING" ||
      !["ERROR", "TIMEOUT"].includes(document.scanStatus) ||
      document.scanAttemptCount >= this.maximumScanAttempts
    )
      documentError(
        "DOCUMENT_RETRY_LIMIT_REACHED",
        "Document is not eligible for a bounded scan retry.",
      );
    return this.completeDocumentUpload({
      intentId: document.uploadIntentId,
      customerUserId: document.customerUserId,
    });
  }

  async abortDocumentUpload(input: {
    intentId: string;
    customerUserId: string;
  }) {
    const intent = await this.repository.getIntent(input.intentId);
    if (!intent)
      documentError("DOCUMENT_INTENT_NOT_FOUND", "Intent not found.");
    await this.openOwnedSession(intent.uploadSessionId, input.customerUserId);
    if (TERMINAL_INTENTS.has(intent.status))
      documentError(
        "DOCUMENT_SESSION_ALREADY_COMPLETED",
        "Terminal intent cannot be aborted.",
      );
    await this.storage.abortUpload({
      targetId: intent.targetId,
      object: intent.object,
    });
    return this.repository.updateIntent(intent.id, intent.revision, {
      status: "ABORTED",
      revision: intent.revision + 1,
    });
  }
  async expireDocumentUploadSession(sessionId: string) {
    const session = await this.repository.getSession(sessionId);
    if (!session)
      documentError("DOCUMENT_SESSION_NOT_FOUND", "Session not found.");
    if (session.status !== "OPEN" || session.expiresAt > this.now())
      return session;
    return this.repository.updateSession(session.id, session.revision, {
      status: "EXPIRED",
      revision: session.revision + 1,
    });
  }
  async getUploadSessionStatus(sessionId: string, customerUserId: string) {
    return this.openOwnedSession(sessionId, customerUserId);
  }
  async requestDocumentReplacement(
    input: Omit<
      Parameters<
        PrivateDocumentLifecycleService["createDocumentUploadIntent"]
      >[0],
      "replacesDocumentId"
    > & { priorDocumentId: string },
  ) {
    return this.createDocumentUploadIntent({
      ...input,
      replacesDocumentId: input.priorDocumentId,
    });
  }
  async listDocumentReplacementHistory(documentId: string) {
    const document = await this.repository.getDocument(documentId);
    if (!document)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Document not found.");
    return (
      await this.repository.listSessionDocuments(document.uploadSessionId)
    )
      .filter(
        (value) =>
          value.documentTypeId === document.documentTypeId &&
          value.side === document.side &&
          value.slotNumber === document.slotNumber,
      )
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
  }
}
