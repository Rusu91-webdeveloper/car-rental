import { randomUUID } from "node:crypto";
import { CAPABILITIES } from "@/lib/authorization/capabilities";
import { documentError } from "../domain/errors";
import type { DocumentActor } from "../domain/types";
import {
  requireDocumentCapability,
  type PolicyPermission,
} from "../authorization/service";
import type { DocumentLifecycleRepository } from "./repository";

export class DocumentLegalHoldService {
  constructor(
    private readonly repository: DocumentLifecycleRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async apply(input: {
    documentId: string;
    actor: DocumentActor;
    permission: PolicyPermission;
    reason: string;
    reviewAt?: Date;
  }) {
    requireDocumentCapability(
      input.actor,
      CAPABILITIES.DOCUMENTS_LEGAL_HOLD_MANAGE,
      input.permission,
    );
    if (!input.reason.trim())
      documentError(
        "DOCUMENT_LEGAL_HOLD_REQUIRED_REASON",
        "Legal hold reason is required.",
      );
    const document = await this.repository.getDocument(input.documentId);
    if (!document)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Document not found.");
    const existing = await this.repository.getActiveHold(document.id);
    if (existing) return existing;
    const hold = await this.repository.applyHold({
      id: randomUUID(),
      customerDocumentId: document.id,
      reason: input.reason.trim(),
      appliedById: input.actor.userId,
      appliedAt: this.now(),
      reviewAt: input.reviewAt,
      revision: 1,
    });
    await this.repository.audit({
      actorUserId: input.actor.userId,
      action: "document.legal_hold_applied",
      targetType: "CustomerDocument",
      targetId: document.id,
      customerDocumentId: document.id,
      configurationReleaseId: document.configurationReleaseId,
    });
    return hold;
  }
  async release(input: {
    holdId: string;
    documentId: string;
    expectedRevision: number;
    actor: DocumentActor;
    permission: PolicyPermission;
    reason: string;
  }) {
    requireDocumentCapability(
      input.actor,
      CAPABILITIES.DOCUMENTS_LEGAL_HOLD_MANAGE,
      input.permission,
    );
    if (!input.reason.trim())
      documentError(
        "DOCUMENT_LEGAL_HOLD_REQUIRED_REASON",
        "Release reason is required.",
      );
    const hold = await this.repository.releaseHold(
      input.holdId,
      input.expectedRevision,
      input.actor.userId,
      input.reason.trim(),
      this.now(),
    );
    await this.repository.audit({
      actorUserId: input.actor.userId,
      action: "document.legal_hold_released",
      targetType: "CustomerDocument",
      targetId: input.documentId,
      customerDocumentId: input.documentId,
    });
    return hold;
  }
  getActive(documentId: string) {
    return this.repository.getActiveHold(documentId);
  }
  history(documentId: string) {
    return this.repository.listHolds(documentId);
  }
}
