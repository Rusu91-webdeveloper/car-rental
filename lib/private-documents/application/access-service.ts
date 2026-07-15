import { CAPABILITIES } from "@/lib/authorization/capabilities";
import { documentError } from "../domain/errors";
import type { DocumentActor } from "../domain/types";
import type { PrivateDocumentStorage } from "../storage/contracts";
import {
  requireDocumentCapability,
  type PolicyPermission,
} from "../authorization/service";
import {
  requireRecentAuthentication,
  type RecentAuthenticationEvidence,
  type RecentAuthenticationVerifier,
} from "../authorization/recent-auth";
import type { DocumentLifecycleRepository } from "./repository";

export class DocumentAccessService {
  constructor(
    private readonly repository: DocumentLifecycleRepository,
    private readonly storage: PrivateDocumentStorage,
    private readonly recentAuth: RecentAuthenticationVerifier,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async authorize(input: {
    documentId: string;
    actor: DocumentActor;
    permission: PolicyPermission;
    purpose: "VIEW" | "DOWNLOAD";
    evidence?: RecentAuthenticationEvidence;
    recentAuthMaximumAgeMs: number;
    scope?: {
      bookingId?: string;
      customerUserId?: string;
      uploadSessionId?: string;
    };
  }) {
    const capability =
      input.purpose === "DOWNLOAD"
        ? CAPABILITIES.DOCUMENTS_DOWNLOAD
        : CAPABILITIES.DOCUMENTS_VIEW;
    await this.repository.audit({
      actorUserId: input.actor.userId,
      action: "document.access_requested",
      targetType: "CustomerDocument",
      targetId: input.documentId,
      customerDocumentId: input.documentId,
      metadata: { purpose: input.purpose },
    });
    try {
      requireDocumentCapability(input.actor, capability, input.permission);
      const document = await this.repository.getDocument(input.documentId);
      const pendingReviewerPreview =
        input.purpose === "VIEW" &&
        document?.uploadStatus === "TECHNICALLY_VALID" &&
        document.scanStatus === "NOT_AVAILABLE" &&
        document.manualReviewStatus === "PENDING_REVIEW";
      if (pendingReviewerPreview)
        requireDocumentCapability(
          input.actor,
          CAPABILITIES.DOCUMENTS_REVIEW,
        );
      await requireRecentAuthentication(this.recentAuth, {
        userId: input.actor.userId,
        evidence: input.evidence,
        maximumAgeMs: input.recentAuthMaximumAgeMs,
      });
      const approvedManual =
        document?.uploadStatus === "TECHNICALLY_VALID" &&
        document.scanStatus === "NOT_AVAILABLE" &&
        document.manualReviewStatus === "APPROVED";
      const approvedScanner =
        document?.uploadStatus === "READY" && document.scanStatus === "CLEAN";
      if (
        !document ||
        (!pendingReviewerPreview && !approvedManual && !approvedScanner) ||
        (!pendingReviewerPreview && document.object.namespace !== "approved") ||
        document.deletionStatus !== "RETAINED" ||
        (!pendingReviewerPreview && !document.isCurrent) ||
        document.retentionUntil <= this.now() ||
        !document.configurationReleaseId ||
        !document.documentPolicyConfigVersionId ||
        !document.uploadSessionId ||
        !document.uploadIntentId ||
        (input.scope?.bookingId !== undefined &&
          document.bookingId !== input.scope.bookingId) ||
        (input.scope?.customerUserId !== undefined &&
          document.customerUserId !== input.scope.customerUserId) ||
        (input.scope?.uploadSessionId !== undefined &&
          document.uploadSessionId !== input.scope.uploadSessionId)
      )
        documentError(
          "DOCUMENT_NOT_ACCESSIBLE",
          "Document is unavailable for access.",
        );
      return document;
    } catch (error) {
      await this.repository.audit({
        actorUserId: input.actor.userId,
        action: "document.access_denied",
        targetType: "CustomerDocument",
        targetId: input.documentId,
        customerDocumentId: input.documentId,
        metadata: {
          purpose: input.purpose,
          legacyCompatibilityAttempt:
            input.actor.role === "ADMIN" ||
            Boolean(input.actor.assignedRoleKeys?.has("ADMIN_COMPAT")),
        },
      });
      throw error;
    }
  }

  async open(input: Parameters<DocumentAccessService["authorize"]>[0]) {
    const document = await this.authorize(input);
    const read = await this.storage.openPrivateRead(document.object);
    await this.repository.audit({
      actorUserId: input.actor.userId,
      action:
        input.purpose === "DOWNLOAD"
          ? "document.download_granted"
          : "document.view_granted",
      targetType: "CustomerDocument",
      targetId: document.id,
      customerDocumentId: document.id,
      configurationReleaseId: document.configurationReleaseId,
      metadata: { purpose: input.purpose },
    });
    return { document, read };
  }

  async issue(input: Parameters<DocumentAccessService["authorize"]>[0]) {
    const document = await this.authorize(input);
    try {
      const expiresAt = new Date(this.now().getTime() + 5 * 60_000);
      const grant = await this.storage.createShortLivedReadAccess(
        document.object,
        {
          documentId: document.id,
          requesterId: input.actor.userId,
          purpose: input.purpose,
          expiresAt,
          oneTime: input.purpose === "DOWNLOAD",
        },
      );
      await this.repository.audit({
        actorUserId: input.actor.userId,
        action: "document.access_granted",
        targetType: "CustomerDocument",
        targetId: document.id,
        customerDocumentId: document.id,
        configurationReleaseId: document.configurationReleaseId,
        metadata: {
          purpose: input.purpose,
          expiresAt: expiresAt.toISOString(),
        },
      });
      return grant;
    } catch (error) {
      throw error;
    }
  }
}
