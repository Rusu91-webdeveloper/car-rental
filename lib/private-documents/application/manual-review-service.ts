import { CAPABILITIES } from "@/lib/authorization/capabilities";
import {
  requireRecentAuthentication,
  type RecentAuthenticationEvidence,
  type RecentAuthenticationVerifier,
} from "../authorization/recent-auth";
import {
  requireDocumentCapability,
  type PolicyPermission,
} from "../authorization/service";
import { documentError } from "../domain/errors";
import type { DocumentActor } from "../domain/types";
import type {
  DocumentLifecycleRepository,
  DocumentReviewReasonValue,
  ReviewDecisionRecord,
} from "./repository";

const REVIEW_REASONS = new Set<DocumentReviewReasonValue>([
  "UNREADABLE",
  "CROPPED",
  "WRONG_DOCUMENT",
  "WRONG_SIDE",
  "EXPIRED",
  "DETAILS_MISMATCH",
  "MISSING_INFORMATION",
  "SUSPECTED_ALTERATION",
  "DUPLICATE",
  "OTHER",
]);

export const CUSTOMER_REVIEW_MESSAGES: Record<
  DocumentReviewReasonValue,
  string
> = {
  UNREADABLE: "The document is not clear enough to review.",
  CROPPED: "Part of the document is missing from the image.",
  WRONG_DOCUMENT: "Please upload the requested document type.",
  WRONG_SIDE: "Please upload the requested side of the document.",
  EXPIRED: "The document appears to be expired.",
  DETAILS_MISMATCH: "The document details could not be matched to the booking.",
  MISSING_INFORMATION: "Required document information is not visible.",
  SUSPECTED_ALTERATION: "Please upload a new image of the original document.",
  DUPLICATE: "This upload duplicates another document.",
  OTHER: "Please upload a replacement document.",
};

function normalizeSafeNote(note: string | undefined, required: boolean) {
  if (note === undefined) {
    if (required)
      documentError(
        "DOCUMENT_REVIEW_NOTE_INVALID",
        "A short safe note is required for OTHER.",
      );
    return undefined;
  }
  const normalized = note.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 500 ||
    /[<>]/.test(normalized) ||
    /https?:\/\/|www\.|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[\/:?]|$)/i.test(
      normalized,
    )
  )
    documentError(
      "DOCUMENT_REVIEW_NOTE_INVALID",
      "Reviewer note must be short plain text without links.",
    );
  return normalized;
}

export class ManualDocumentReviewService {
  constructor(
    private readonly repository: DocumentLifecycleRepository,
    private readonly recentAuth: RecentAuthenticationVerifier,
    private readonly recentAuthMaximumAgeMs = 10 * 60_000,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async authorize(input: {
    actor: DocumentActor;
    permission: PolicyPermission;
    evidence?: RecentAuthenticationEvidence;
    requestReplacement?: boolean;
  }) {
    requireDocumentCapability(
      input.actor,
      CAPABILITIES.DOCUMENTS_REVIEW,
    );
    requireDocumentCapability(
      input.actor,
      CAPABILITIES.DOCUMENTS_VIEW,
      input.permission,
    );
    if (input.requestReplacement)
      requireDocumentCapability(
        input.actor,
        CAPABILITIES.DOCUMENTS_REQUEST_REPLACEMENT,
      );
    await requireRecentAuthentication(this.recentAuth, {
      userId: input.actor.userId,
      evidence: input.evidence,
      maximumAgeMs: this.recentAuthMaximumAgeMs,
    });
  }

  async loadDocumentForReview(input: {
    documentId: string;
    actor: DocumentActor;
    permission: PolicyPermission;
    evidence?: RecentAuthenticationEvidence;
  }) {
    await this.authorize(input);
    const document = await this.repository.getDocument(input.documentId);
    if (
      !document ||
      document.uploadStatus !== "TECHNICALLY_VALID" ||
      document.scanStatus !== "NOT_AVAILABLE" ||
      document.manualReviewStatus !== "PENDING_REVIEW" ||
      document.deletionStatus !== "RETAINED" ||
      document.retentionUntil <= this.now()
    )
      documentError(
        "DOCUMENT_REVIEW_NOT_PENDING",
        "Document is not available for manual review.",
      );
    await this.repository.audit({
      actorUserId: input.actor.userId,
      action: "document.review_opened",
      targetType: "CustomerDocument",
      targetId: document.id,
      customerDocumentId: document.id,
      configurationReleaseId: document.configurationReleaseId,
    });
    return {
      documentId: document.id,
      bookingId: document.bookingId,
      documentTypeId: document.documentTypeId,
      side: document.side,
      slotNumber: document.slotNumber,
      attemptNumber: document.attemptNumber,
      reviewRevision: document.reviewRevision,
      status: document.manualReviewStatus,
      validation: {
        detectedMimeType: document.validation.detectedMimeType,
        detectedFileType: document.validation.detectedFileType,
        sizeBytes: document.validation.sizeBytes,
        checksumSha256: document.validation.checksumSha256,
      },
    };
  }

  private async decide(input: {
    documentId: string;
    expectedReviewRevision: number;
    actor: DocumentActor;
    permission: PolicyPermission;
    evidence?: RecentAuthenticationEvidence;
    decision: ReviewDecisionRecord["decision"];
    reasonCode?: DocumentReviewReasonValue;
    safeReviewerNote?: string;
  }) {
    await this.authorize({
      ...input,
      requestReplacement: input.decision === "REPLACEMENT_REQUIRED",
    });
    if (input.decision === "APPROVED" && input.reasonCode)
      documentError(
        "DOCUMENT_REVIEW_REASON_REQUIRED",
        "Approval cannot include a rejection reason.",
      );
    if (
      input.decision !== "APPROVED" &&
      (!input.reasonCode || !REVIEW_REASONS.has(input.reasonCode))
    )
      documentError(
        "DOCUMENT_REVIEW_REASON_REQUIRED",
        "A structured review reason is required.",
      );
    const note = normalizeSafeNote(
      input.safeReviewerNote,
      input.reasonCode === "OTHER",
    );
    return this.repository.recordReviewDecision({
      documentId: input.documentId,
      expectedReviewRevision: input.expectedReviewRevision,
      reviewerId: input.actor.userId,
      decision: input.decision,
      reasonCode: input.reasonCode,
      safeReviewerNote: note,
    });
  }

  approveDocument(
    input: Omit<Parameters<ManualDocumentReviewService["decide"]>[0], "decision" | "reasonCode">,
  ) {
    return this.decide({ ...input, decision: "APPROVED" });
  }

  rejectDocument(
    input: Omit<Parameters<ManualDocumentReviewService["decide"]>[0], "decision">,
  ) {
    return this.decide({ ...input, decision: "REJECTED" });
  }

  requestDocumentReplacement(
    input: Omit<Parameters<ManualDocumentReviewService["decide"]>[0], "decision">,
  ) {
    return this.decide({ ...input, decision: "REPLACEMENT_REQUIRED" });
  }

  async listDocumentReviewHistory(input: {
    documentId: string;
    actor: DocumentActor;
    permission: PolicyPermission;
  }) {
    requireDocumentCapability(input.actor, CAPABILITIES.DOCUMENTS_REVIEW);
    requireDocumentCapability(
      input.actor,
      CAPABILITIES.DOCUMENTS_VIEW,
      input.permission,
    );
    return this.repository.listReviewDecisions(input.documentId);
  }

  async listReviewQueue(input: {
    actor: DocumentActor;
    statuses?: Array<
      "PENDING_REVIEW" | "REJECTED" | "REPLACEMENT_REQUIRED"
    >;
    documentTypeId?: string;
    bookingId?: string;
    uploadedFrom?: Date;
    uploadedTo?: Date;
    minimumPendingAgeMs?: number;
    cursor?: string;
    limit?: number;
  }) {
    requireDocumentCapability(input.actor, CAPABILITIES.DOCUMENTS_REVIEW);
    const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
    return this.repository.listReviewQueue({
      statuses: input.statuses ?? ["PENDING_REVIEW"],
      documentTypeId: input.documentTypeId,
      bookingId: input.bookingId,
      uploadedFrom: input.uploadedFrom,
      uploadedTo: input.uploadedTo,
      minimumPendingAgeMs:
        input.minimumPendingAgeMs === undefined
          ? undefined
          : Math.max(0, Math.min(input.minimumPendingAgeMs, 30 * 86_400_000)),
      cursor: input.cursor,
      limit,
      now: this.now(),
    });
  }
}
