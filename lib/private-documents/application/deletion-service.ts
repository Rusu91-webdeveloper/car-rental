import { randomUUID } from "node:crypto";
import { CAPABILITIES } from "@/lib/authorization/capabilities";
import { documentError } from "../domain/errors";
import type { DocumentActor } from "../domain/types";
import type { PrivateDocumentStorage } from "../storage/contracts";
import {
  requireDocumentCapability,
  type PolicyPermission,
} from "../authorization/service";
import {
  deletionIsEligible,
  PROVISIONAL_RETENTION,
} from "../retention/calculator";
import type { DocumentLifecycleRepository } from "./repository";

export class DocumentDeletionService {
  constructor(
    private readonly repository: DocumentLifecycleRepository,
    private readonly storage: PrivateDocumentStorage,
    private readonly now: () => Date = () => new Date(),
    private readonly maximumAttempts = 3,
  ) {}
  async request(input: {
    documentId: string;
    idempotencyKey: string;
    actor: DocumentActor;
    permission: PolicyPermission;
    reason: string;
  }) {
    requireDocumentCapability(
      input.actor,
      CAPABILITIES.DOCUMENTS_DELETE,
      input.permission,
    );
    const existing = await this.repository.getDeletionByIdempotency(
      input.idempotencyKey,
    );
    if (existing) return existing;
    const document = await this.repository.getDocument(input.documentId);
    if (!document)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Document not found.");
    if (await this.repository.getActiveHold(document.id))
      documentError(
        "DOCUMENT_LEGAL_HOLD_ACTIVE",
        "Active legal hold blocks deletion.",
      );
    if (
      !deletionIsEligible({
        now: this.now(),
        deletionEligibleAt: document.deletionEligibleAt,
        activeLegalHold: false,
      })
    )
      documentError(
        "DOCUMENT_DELETION_NOT_ELIGIBLE",
        "Retention deadline has not elapsed.",
      );
    const requestedAt = this.now();
    const record = await this.repository.createDeletion({
      id: randomUUID(),
      customerDocumentId: document.id,
      idempotencyKey: input.idempotencyKey,
      requestedById: input.actor.userId,
      reason: input.reason.trim() || "RETENTION_EXPIRED",
      requestedAt,
      eligibleAt: document.deletionEligibleAt,
      mustCompleteBy: new Date(
        requestedAt.getTime() +
          PROVISIONAL_RETENTION.deletionGraceDays * 86_400_000,
      ),
      status: "SCHEDULED",
      revision: 1,
      attempts: [],
    });
    await this.repository.updateDocument(document.id, {
      deletionStatus: "SCHEDULED",
    });
    await this.repository.audit({
      actorUserId: input.actor.userId,
      action: "document.deletion_requested",
      targetType: "CustomerDocument",
      targetId: document.id,
      customerDocumentId: document.id,
      configurationReleaseId: document.configurationReleaseId,
    });
    return record;
  }
  async process(input: { idempotencyKey: string }) {
    let request = await this.repository.getDeletionByIdempotency(
      input.idempotencyKey,
    );
    if (!request)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Deletion request not found.");
    if (request.status === "COMPLETED") return request;
    if (request.attempts.length >= this.maximumAttempts)
      documentError(
        "DOCUMENT_RETRY_LIMIT_REACHED",
        "Deletion retry limit reached.",
      );
    const document = await this.repository.getDocument(
      request.customerDocumentId,
    );
    if (!document)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Document not found.");
    if (await this.repository.getActiveHold(document.id))
      documentError(
        "DOCUMENT_LEGAL_HOLD_ACTIVE",
        "Active legal hold blocks deletion.",
      );
    request = await this.repository.updateDeletion(
      request.id,
      request.revision,
      { status: "IN_PROGRESS", revision: request.revision + 1 },
    );
    const attemptNumber = request.attempts.length + 1;
    try {
      const result = await this.storage.deleteObject(document.object);
      if (await this.storage.objectExists(document.object))
        throw new Error("Object still exists after deletion");
      request = await this.repository.appendDeletionAttempt(request.id, {
        attemptNumber,
        outcome: result.alreadyMissing ? "ALREADY_MISSING" : "DELETED",
        retryable: false,
        providerConfirmationRef: result.confirmationReference,
      });
      request = await this.repository.updateDeletion(
        request.id,
        request.revision,
        {
          status: "COMPLETED",
          revision: request.revision + 1,
          providerConfirmationRef: result.confirmationReference,
          completedAt: this.now(),
        },
      );
      await this.repository.updateDocument(document.id, {
        deletionStatus: "DELETED",
        deletedAt: this.now(),
        isCurrent: false,
        object: { ...document.object, namespace: document.object.namespace },
      });
      await this.repository.audit({
        action: "document.deletion_attempt_succeeded",
        targetType: "CustomerDocument",
        targetId: document.id,
        customerDocumentId: document.id,
        configurationReleaseId: document.configurationReleaseId,
        metadata: { attemptNumber, alreadyMissing: result.alreadyMissing },
      });
      return request;
    } catch {
      request = await this.repository.appendDeletionAttempt(request.id, {
        attemptNumber,
        outcome: "RETRYABLE_FAILURE",
        retryable: true,
        safeFailureCode: "PROVIDER_DELETE_FAILED",
      });
      request = await this.repository.updateDeletion(
        request.id,
        request.revision,
        { status: "FAILED", revision: request.revision + 1 },
      );
      await this.repository.updateDocument(document.id, {
        deletionStatus: "FAILED",
      });
      await this.repository.audit({
        action: "document.deletion_attempt_failed",
        targetType: "CustomerDocument",
        targetId: document.id,
        customerDocumentId: document.id,
        metadata: { attemptNumber, retryable: true },
      });
      return request;
    }
  }

  getStatus(idempotencyKey: string) {
    return this.repository.getDeletionByIdempotency(idempotencyKey);
  }

  retry(idempotencyKey: string) {
    return this.process({ idempotencyKey });
  }
}
