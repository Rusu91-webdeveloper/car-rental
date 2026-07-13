import { randomUUID } from "node:crypto";
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
  ReviewDecisionRecord,
  SessionRecord,
} from "../application/repository";

export class InMemoryDocumentLifecycleRepository implements DocumentLifecycleRepository {
  sessions = new Map<string, SessionRecord>();
  intents = new Map<string, IntentRecord>();
  documents = new Map<string, DocumentRecord>();
  holds = new Map<string, LegalHoldRecord>();
  deletions = new Map<string, DeletionRecord>();
  audits: SafeAuditInput[] = [];
  reviewDecisions = new Map<string, ReviewDecisionRecord[]>();
  private scanEvents = new Map<
    string,
    { documentId: string; attemptNumber: number }
  >();
  constructor(public activePolicy?: PolicyRecord) {}
  async resolveActivePolicy() {
    return this.activePolicy;
  }
  async createSession(record: SessionRecord) {
    this.sessions.set(record.id, structuredClone(record));
    return structuredClone(record);
  }
  async getSession(id: string) {
    const value = this.sessions.get(id);
    return value && structuredClone(value);
  }
  async updateSession(
    id: string,
    expectedRevision: number,
    changes: Partial<SessionRecord>,
  ) {
    const current = this.sessions.get(id);
    if (!current)
      documentError("DOCUMENT_SESSION_NOT_FOUND", "Session not found.");
    if (current.revision !== expectedRevision)
      documentError("DOCUMENT_IDEMPOTENCY_CONFLICT", "Stale session revision.");
    const next = { ...current, ...changes };
    this.sessions.set(id, next);
    return structuredClone(next);
  }
  async createIntent(record: IntentRecord) {
    if (
      [...this.intents.values()].some(
        (value) => value.idempotencyKey === record.idempotencyKey,
      )
    )
      documentError(
        "DOCUMENT_IDEMPOTENCY_CONFLICT",
        "Duplicate intent idempotency.",
      );
    this.intents.set(record.id, structuredClone(record));
    return structuredClone(record);
  }
  async getIntent(id: string) {
    const value = this.intents.get(id);
    return value && structuredClone(value);
  }
  async listSessionIntents(sessionId: string) {
    return [...this.intents.values()]
      .filter((intent) => intent.uploadSessionId === sessionId)
      .map((intent) => structuredClone(intent));
  }
  async findIntentByIdempotency(key: string) {
    const value = [...this.intents.values()].find(
      (intent) => intent.idempotencyKey === key,
    );
    return value && structuredClone(value);
  }
  async updateIntent(
    id: string,
    expectedRevision: number,
    changes: Partial<IntentRecord>,
  ) {
    const current = this.intents.get(id);
    if (!current)
      documentError("DOCUMENT_INTENT_NOT_FOUND", "Intent not found.");
    if (current.revision !== expectedRevision)
      documentError("DOCUMENT_IDEMPOTENCY_CONFLICT", "Stale intent revision.");
    const next = { ...current, ...changes };
    this.intents.set(id, next);
    return structuredClone(next);
  }
  async createDocument(record: DocumentRecord) {
    if (
      [...this.documents.values()].some(
        (value) => value.uploadIntentId === record.uploadIntentId,
      )
    )
      documentError(
        "DOCUMENT_IDEMPOTENCY_CONFLICT",
        "Intent already finalized.",
      );
    if (
      record.replacesDocumentId &&
      [...this.documents.values()].some(
        (value) =>
          value.replacesDocumentId === record.replacesDocumentId &&
          (["UPLOADED", "VERIFYING"].includes(value.uploadStatus) ||
            value.manualReviewStatus === "PENDING_REVIEW") &&
          value.deletionStatus !== "DELETED",
      )
    )
      documentError(
        "DOCUMENT_IDEMPOTENCY_CONFLICT",
        "A pending replacement already exists.",
      );
    this.documents.set(record.id, structuredClone(record));
    return structuredClone(record);
  }
  async getDocument(id: string) {
    const value = this.documents.get(id);
    return value && structuredClone(value);
  }
  async findDocumentByIntent(intentId: string) {
    const value = [...this.documents.values()].find(
      (document) => document.uploadIntentId === intentId,
    );
    return value && structuredClone(value);
  }
  async updateDocument(id: string, changes: Partial<DocumentRecord>) {
    const current = this.documents.get(id);
    if (!current)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Document not found.");
    const next = { ...current, ...changes };
    this.documents.set(id, next);
    return structuredClone(next);
  }
  async promoteReplacement(
    predecessorId: string,
    replacementId: string,
    object: DocumentRecord["object"],
  ) {
    const prior = this.documents.get(predecessorId);
    const replacement = this.documents.get(replacementId);
    if (
      !prior ||
      !replacement ||
      !prior.isCurrent ||
      replacement.isCurrent ||
      replacement.replacesDocumentId !== prior.id
    )
      documentError(
        "DOCUMENT_IDEMPOTENCY_CONFLICT",
        "Stale replacement promotion.",
      );
    prior.isCurrent = false;
    replacement.isCurrent = true;
    replacement.uploadStatus = "READY";
    replacement.object = object;
    return structuredClone(replacement);
  }
  async listSessionDocuments(sessionId: string) {
    return [...this.documents.values()]
      .filter((value) => value.uploadSessionId === sessionId)
      .map((value) => structuredClone(value));
  }
  async recordReviewDecision(input: {
    documentId: string;
    expectedReviewRevision: number;
    reviewerId: string;
    decision: ReviewDecisionRecord["decision"];
    reasonCode?: ReviewDecisionRecord["reasonCode"];
    safeReviewerNote?: string;
  }) {
    const document = this.documents.get(input.documentId);
    if (!document)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Document not found.");
    if (
      document.reviewRevision !== input.expectedReviewRevision ||
      document.manualReviewStatus !== "PENDING_REVIEW"
    )
      documentError(
        "DOCUMENT_REVIEW_STALE_REVISION",
        "Document review revision is stale.",
      );
    const decisions = this.reviewDecisions.get(document.id) ?? [];
    const reviewedAt = new Date();
    const decisionVersion = input.expectedReviewRevision + 1;
    const decision: ReviewDecisionRecord = {
      id: randomUUID(),
      customerDocumentId: document.id,
      decisionVersion,
      previousStatus: "PENDING_REVIEW",
      decision: input.decision,
      reasonCode: input.reasonCode,
      safeReviewerNote: input.safeReviewerNote,
      reviewedById: input.reviewerId,
      reviewedAt,
      configurationReleaseId: document.configurationReleaseId,
      documentPolicyConfigVersionId: document.documentPolicyConfigVersionId,
      documentRequirementTypeId: document.documentTypeId,
      uploadSessionId: document.uploadSessionId,
      customerUserId: document.customerUserId,
      slotNumber: document.slotNumber,
      side: document.side,
      attemptNumber: document.attemptNumber,
    };
    if (input.decision === "APPROVED" && document.replacesDocumentId) {
      const predecessor = this.documents.get(document.replacesDocumentId);
      if (!predecessor?.isCurrent)
        documentError(
          "DOCUMENT_REVIEW_STALE_REVISION",
          "Replacement predecessor is stale.",
        );
      predecessor.isCurrent = false;
      document.isCurrent = true;
    }
    decisions.push(decision);
    this.reviewDecisions.set(document.id, decisions);
    Object.assign(document, {
      manualReviewStatus: input.decision,
      reviewRevision: decisionVersion,
      reviewedById: input.reviewerId,
      reviewedAt,
      reviewReasonCode: input.reasonCode,
      safeReviewerNote: input.safeReviewerNote,
      object: {
        ...document.object,
        namespace:
          input.decision === "APPROVED" ? "approved" : "quarantine",
      },
    });
    return structuredClone(document);
  }
  async listReviewDecisions(documentId: string) {
    return structuredClone(this.reviewDecisions.get(documentId) ?? []);
  }
  async listReviewQueue(input: {
    statuses: DocumentRecord["manualReviewStatus"][];
    documentTypeId?: string;
    bookingId?: string;
    uploadedFrom?: Date;
    uploadedTo?: Date;
    minimumPendingAgeMs?: number;
    cursor?: string;
    limit: number;
    now: Date;
  }) {
    const rows = [...this.documents.values()]
      .filter(
        (document) =>
          input.statuses.includes(document.manualReviewStatus) &&
          (!input.documentTypeId ||
            document.documentTypeId === input.documentTypeId) &&
          (!input.bookingId || document.bookingId === input.bookingId) &&
          document.deletionStatus !== "DELETED",
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const start = input.cursor
      ? Math.max(0, rows.findIndex((row) => row.id === input.cursor) + 1)
      : 0;
    const page = rows.slice(start, start + input.limit);
    return {
      items: page.map((document) => ({
        documentId: document.id,
        bookingId: document.bookingId,
        documentTypeId: document.documentTypeId,
        side: document.side,
        slotNumber: document.slotNumber,
        attemptNumber: document.attemptNumber,
        status: document.manualReviewStatus,
        uploadedAt: new Date(0),
        pendingAgeMs: input.now.getTime(),
      })),
      nextCursor:
        start + input.limit < rows.length ? page.at(-1)?.id : undefined,
    };
  }
  async countPendingReviews() {
    return [...this.documents.values()].filter(
      (document) =>
        document.manualReviewStatus === "PENDING_REVIEW" &&
        document.deletionStatus !== "DELETED",
    ).length;
  }
  async hasKnownObject(input: {
    providerKey: string;
    containerId: string;
    objectKey: string;
  }) {
    return (
      [...this.documents.values()].some(
        (document) =>
          document.object.providerKey === input.providerKey &&
          document.object.containerId === input.containerId &&
          document.object.objectKey === input.objectKey,
      ) ||
      [...this.intents.values()].some(
        (intent) =>
          intent.object.providerKey === input.providerKey &&
          intent.object.containerId === input.containerId &&
          intent.object.objectKey === input.objectKey,
      )
    );
  }
  async appendScanAttempt(documentId: string, result: NormalizedScanResult) {
    const duplicate = this.scanEvents.get(result.providerEventId);
    if (duplicate)
      return { duplicate: true, attemptNumber: duplicate.attemptNumber };
    const document = this.documents.get(documentId);
    if (!document)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Document not found.");
    const attemptNumber = document.scanAttemptCount + 1;
    document.scanAttemptCount = attemptNumber;
    document.scanStatus = result.outcome === "CLEAN" ? "CLEAN" : result.outcome;
    this.scanEvents.set(result.providerEventId, { documentId, attemptNumber });
    return { duplicate: false, attemptNumber };
  }
  async applyHold(record: LegalHoldRecord) {
    if (
      [...this.holds.values()].some(
        (hold) =>
          hold.customerDocumentId === record.customerDocumentId &&
          !hold.releasedAt,
      )
    )
      documentError(
        "DOCUMENT_LEGAL_HOLD_ACTIVE",
        "An active hold already exists.",
      );
    this.holds.set(record.id, structuredClone(record));
    const document = this.documents.get(record.customerDocumentId);
    if (document) document.legalHold = true;
    return structuredClone(record);
  }
  async getActiveHold(documentId: string) {
    const value = [...this.holds.values()].find(
      (hold) => hold.customerDocumentId === documentId && !hold.releasedAt,
    );
    return value && structuredClone(value);
  }
  async listHolds(documentId: string) {
    return [...this.holds.values()]
      .filter((hold) => hold.customerDocumentId === documentId)
      .map((hold) => structuredClone(hold));
  }
  async releaseHold(
    id: string,
    expectedRevision: number,
    actorId: string,
    reason: string,
    at: Date,
  ) {
    const hold = this.holds.get(id);
    if (!hold || hold.revision !== expectedRevision || hold.releasedAt)
      documentError("DOCUMENT_IDEMPOTENCY_CONFLICT", "Hold release is stale.");
    Object.assign(hold, {
      releasedById: actorId,
      releasedAt: at,
      releaseReason: reason,
      revision: expectedRevision + 1,
    });
    const document = this.documents.get(hold.customerDocumentId);
    if (document) document.legalHold = false;
    return structuredClone(hold);
  }
  async createDeletion(record: DeletionRecord) {
    const existing = [...this.deletions.values()].find(
      (value) => value.idempotencyKey === record.idempotencyKey,
    );
    if (existing) return structuredClone(existing);
    this.deletions.set(record.id, structuredClone(record));
    return structuredClone(record);
  }
  async getDeletionByIdempotency(key: string) {
    const value = [...this.deletions.values()].find(
      (record) => record.idempotencyKey === key,
    );
    return value && structuredClone(value);
  }
  async updateDeletion(
    id: string,
    expectedRevision: number,
    changes: Partial<DeletionRecord>,
  ) {
    const record = this.deletions.get(id);
    if (!record || record.revision !== expectedRevision)
      documentError(
        "DOCUMENT_IDEMPOTENCY_CONFLICT",
        "Deletion transition is stale.",
      );
    const next = { ...record, ...changes };
    this.deletions.set(id, next);
    return structuredClone(next);
  }
  async appendDeletionAttempt(
    id: string,
    attempt: DeletionRecord["attempts"][number],
  ) {
    const record = this.deletions.get(id);
    if (!record)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Deletion request not found.");
    if (
      record.attempts.some(
        (value) => value.attemptNumber === attempt.attemptNumber,
      )
    )
      return structuredClone(record);
    record.attempts.push(structuredClone(attempt));
    return structuredClone(record);
  }
  async audit(input: SafeAuditInput) {
    this.audits.push(structuredClone(input));
  }
  async listAudits() {
    return structuredClone(this.audits);
  }
  async findExpiredSessions(now: Date, limit: number) {
    return [...this.sessions.values()]
      .filter(
        (session) => session.status === "OPEN" && session.expiresAt <= now,
      )
      .slice(0, limit)
      .map((value) => structuredClone(value));
  }
  async findDueDocuments(now: Date, limit: number) {
    return [...this.documents.values()]
      .filter(
        (document) =>
          document.deletionStatus !== "DELETED" &&
          !document.legalHold &&
          document.deletionEligibleAt <= now,
      )
      .slice(0, limit)
      .map((value) => structuredClone(value));
  }
  async findRetryableScanDocuments(limit: number, maximumAttempts: number) {
    return [...this.documents.values()]
      .filter(
        (document) =>
          document.uploadStatus === "VERIFYING" &&
          ["ERROR", "TIMEOUT"].includes(document.scanStatus) &&
          document.scanAttemptCount < maximumAttempts,
      )
      .slice(0, limit)
      .map((document) => structuredClone(document));
  }
  static id() {
    return randomUUID();
  }
}
