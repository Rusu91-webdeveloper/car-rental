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
  async issue(input: {
    documentId: string;
    actor: DocumentActor;
    permission: PolicyPermission;
    purpose: "VIEW" | "DOWNLOAD";
    authenticatedAt?: Date;
    recentAuthMaximumAgeMs: number;
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
      if (input.purpose === "DOWNLOAD")
        await requireRecentAuthentication(this.recentAuth, {
          userId: input.actor.userId,
          authenticatedAt: input.authenticatedAt,
          maximumAgeMs: input.recentAuthMaximumAgeMs,
        });
      const document = await this.repository.getDocument(input.documentId);
      if (
        !document ||
        document.uploadStatus !== "READY" ||
        document.scanStatus !== "CLEAN" ||
        document.object.namespace !== "approved" ||
        document.deletionStatus !== "RETAINED" ||
        !document.isCurrent ||
        document.retentionUntil <= this.now() ||
        !document.configurationReleaseId ||
        !document.documentPolicyConfigVersionId ||
        !document.uploadSessionId ||
        !document.uploadIntentId
      )
        documentError(
          "DOCUMENT_SCAN_NOT_CLEAN",
          "Document is unavailable for access.",
        );
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
      await this.repository.audit({
        actorUserId: input.actor.userId,
        action: "document.access_denied",
        targetType: "CustomerDocument",
        targetId: input.documentId,
        customerDocumentId: input.documentId,
        metadata: { purpose: input.purpose },
      });
      throw error;
    }
  }
}
