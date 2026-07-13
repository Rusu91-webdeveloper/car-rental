import type { NormalizedScanResult } from "../scanning/contracts";
import type { PrivateObjectReference, SafeAuditInput } from "../domain/types";
import type { ValidatedDocumentFile } from "./file-validation";

export interface RequirementRecord {
  documentTypeId: string;
  documentTypeKey: "IDENTITY_CARD" | "PASSPORT" | "DRIVING_LICENCE";
  mode: "REQUIRED" | "OPTIONAL" | "DISABLED";
  fileCount: number;
  sides: "SINGLE_FILE" | "FRONT_AND_BACK";
  uploadStage: "DURING_BOOKING" | "AFTER_REQUEST" | "BEFORE_PICKUP";
}
export interface PolicyRecord {
  configurationReleaseId: string;
  documentPolicyConfigVersionId: string;
  retentionPreferenceDays: number;
  identityDocumentChoice:
    | "DISABLED"
    | "IDENTITY_CARD_ONLY"
    | "PASSPORT_ONLY"
    | "EITHER_IDENTITY_CARD_OR_PASSPORT"
    | "BOTH";
  requirements: RequirementRecord[];
}
export interface SessionRecord extends PolicyRecord {
  id: string;
  customerUserId: string;
  carId: string;
  pickupAt: Date;
  returnAt: Date;
  locale: string;
  status: "OPEN" | "CONSUMED" | "EXPIRED" | "ABORTED";
  revision: number;
  expiresAt: Date;
  consumedAt?: Date;
  abortedAt?: Date;
}
export interface IntentRecord {
  id: string;
  uploadSessionId: string;
  documentPolicyConfigVersionId: string;
  documentTypeId: string;
  side: "SINGLE" | "FRONT" | "BACK";
  slotNumber: number;
  attemptNumber: number;
  idempotencyKey: string;
  originalFileName: string;
  declaredMimeType: string;
  expectedSizeBytes: number;
  expectedChecksumSha256: string;
  targetId: string;
  object: PrivateObjectReference;
  status:
    | "INTENT_CREATED"
    | "UPLOADING"
    | "UPLOADED"
    | "VERIFYING"
    | "QUARANTINED"
    | "TECHNICALLY_VALID"
    | "SCAN_PENDING"
    | "CLEAN"
    | "REJECTED"
    | "FAILED"
    | "ABORTED"
    | "EXPIRED";
  revision: number;
  expiresAt: Date;
  cleanupEligibleAt: Date;
  failureCode?: string;
  replacesDocumentId?: string;
}
export interface DocumentRecord {
  id: string;
  bookingId?: string;
  customerUserId: string;
  uploadedById: string;
  documentTypeId: string;
  side: "SINGLE" | "FRONT" | "BACK";
  slotNumber: number;
  attemptNumber: number;
  uploadSessionId: string;
  uploadIntentId: string;
  configurationReleaseId: string;
  documentPolicyConfigVersionId: string;
  object: PrivateObjectReference;
  validation: ValidatedDocumentFile;
  uploadStatus:
    | "UPLOADED"
    | "VERIFYING"
    | "TECHNICALLY_VALID"
    | "READY"
    | "REJECTED"
    | "FAILED";
  scanStatus:
    | "PENDING"
    | "CLEAN"
    | "INFECTED"
    | "ERROR"
    | "TIMEOUT"
    | "UNSUPPORTED"
    | "PASSWORD_PROTECTED"
    | "FAILED"
    | "NOT_AVAILABLE";
  scanAttemptCount: number;
  manualReviewStatus:
    | "NOT_READY"
    | "PENDING_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "REPLACEMENT_REQUIRED";
  reviewRevision: number;
  reviewedById?: string;
  reviewedAt?: Date;
  reviewReasonCode?: DocumentReviewReasonValue;
  safeReviewerNote?: string;
  isCurrent: boolean;
  replacesDocumentId?: string;
  retentionUntil: Date;
  deletionEligibleAt: Date;
  retentionBasis:
    | "UPLOAD_SESSION_EXPIRY"
    | "BOOKING_CANCELLED"
    | "RENTAL_COMPLETED"
    | "REJECTED_UPLOAD"
    | "INCIDENT_PRESERVATION";
  legalHold: boolean;
  deletionStatus: "RETAINED" | "SCHEDULED" | "DELETED" | "FAILED";
  deletedAt?: Date;
}

export type DocumentReviewReasonValue =
  | "UNREADABLE"
  | "CROPPED"
  | "WRONG_DOCUMENT"
  | "WRONG_SIDE"
  | "EXPIRED"
  | "DETAILS_MISMATCH"
  | "MISSING_INFORMATION"
  | "SUSPECTED_ALTERATION"
  | "DUPLICATE"
  | "OTHER";

export interface ReviewDecisionRecord {
  id: string;
  customerDocumentId: string;
  decisionVersion: number;
  previousStatus: "PENDING_REVIEW";
  decision: "APPROVED" | "REJECTED" | "REPLACEMENT_REQUIRED";
  reasonCode?: DocumentReviewReasonValue;
  safeReviewerNote?: string;
  reviewedById: string;
  reviewedAt: Date;
  configurationReleaseId: string;
  documentPolicyConfigVersionId: string;
  documentRequirementTypeId: string;
  uploadSessionId: string;
  customerUserId: string;
  slotNumber: number;
  side: "SINGLE" | "FRONT" | "BACK";
  attemptNumber: number;
}

export interface ReviewQueueItem {
  documentId: string;
  bookingId?: string;
  documentTypeId: string;
  side: "SINGLE" | "FRONT" | "BACK";
  slotNumber: number;
  attemptNumber: number;
  status: DocumentRecord["manualReviewStatus"];
  uploadedAt: Date;
  pendingAgeMs: number;
}
export interface LegalHoldRecord {
  id: string;
  customerDocumentId: string;
  reason: string;
  appliedById: string;
  appliedAt: Date;
  reviewAt?: Date;
  releasedById?: string;
  releasedAt?: Date;
  releaseReason?: string;
  revision: number;
}
export interface DeletionRecord {
  id: string;
  customerDocumentId: string;
  idempotencyKey: string;
  requestedById?: string;
  reason: string;
  requestedAt: Date;
  eligibleAt: Date;
  mustCompleteBy: Date;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  revision: number;
  providerConfirmationRef?: string;
  completedAt?: Date;
  attempts: Array<{
    attemptNumber: number;
    outcome:
      | "DELETED"
      | "ALREADY_MISSING"
      | "RETRYABLE_FAILURE"
      | "PERMANENT_FAILURE";
    retryable: boolean;
    safeFailureCode?: string;
    providerConfirmationRef?: string;
  }>;
}

export interface DocumentLifecycleRepository {
  resolveActivePolicy(): Promise<PolicyRecord | undefined>;
  createSession(record: SessionRecord): Promise<SessionRecord>;
  getSession(id: string): Promise<SessionRecord | undefined>;
  updateSession(
    id: string,
    expectedRevision: number,
    changes: Partial<SessionRecord>,
  ): Promise<SessionRecord>;
  createIntent(record: IntentRecord): Promise<IntentRecord>;
  getIntent(id: string): Promise<IntentRecord | undefined>;
  listSessionIntents(sessionId: string): Promise<IntentRecord[]>;
  findIntentByIdempotency(key: string): Promise<IntentRecord | undefined>;
  updateIntent(
    id: string,
    expectedRevision: number,
    changes: Partial<IntentRecord>,
  ): Promise<IntentRecord>;
  createDocument(record: DocumentRecord): Promise<DocumentRecord>;
  getDocument(id: string): Promise<DocumentRecord | undefined>;
  findDocumentByIntent(intentId: string): Promise<DocumentRecord | undefined>;
  updateDocument(
    id: string,
    changes: Partial<DocumentRecord>,
  ): Promise<DocumentRecord>;
  promoteReplacement(
    predecessorId: string,
    replacementId: string,
    approvedObject: PrivateObjectReference,
  ): Promise<DocumentRecord>;
  listSessionDocuments(sessionId: string): Promise<DocumentRecord[]>;
  recordReviewDecision(input: {
    documentId: string;
    expectedReviewRevision: number;
    reviewerId: string;
    decision: ReviewDecisionRecord["decision"];
    reasonCode?: DocumentReviewReasonValue;
    safeReviewerNote?: string;
  }): Promise<DocumentRecord>;
  listReviewDecisions(documentId: string): Promise<ReviewDecisionRecord[]>;
  listReviewQueue(input: {
    statuses: DocumentRecord["manualReviewStatus"][];
    documentTypeId?: string;
    bookingId?: string;
    uploadedFrom?: Date;
    uploadedTo?: Date;
    minimumPendingAgeMs?: number;
    cursor?: string;
    limit: number;
    now: Date;
  }): Promise<{ items: ReviewQueueItem[]; nextCursor?: string }>;
  countPendingReviews(olderThan?: Date): Promise<number>;
  hasKnownObject(input: {
    providerKey: string;
    containerId: string;
    objectKey: string;
  }): Promise<boolean>;
  appendScanAttempt(
    documentId: string,
    result: NormalizedScanResult,
  ): Promise<{ duplicate: boolean; attemptNumber: number }>;
  applyHold(record: LegalHoldRecord): Promise<LegalHoldRecord>;
  getActiveHold(documentId: string): Promise<LegalHoldRecord | undefined>;
  listHolds(documentId: string): Promise<LegalHoldRecord[]>;
  releaseHold(
    id: string,
    expectedRevision: number,
    actorId: string,
    reason: string,
    at: Date,
  ): Promise<LegalHoldRecord>;
  createDeletion(record: DeletionRecord): Promise<DeletionRecord>;
  getDeletionByIdempotency(key: string): Promise<DeletionRecord | undefined>;
  updateDeletion(
    id: string,
    expectedRevision: number,
    changes: Partial<DeletionRecord>,
  ): Promise<DeletionRecord>;
  appendDeletionAttempt(
    id: string,
    attempt: DeletionRecord["attempts"][number],
  ): Promise<DeletionRecord>;
  audit(input: SafeAuditInput): Promise<void>;
  listAudits(): Promise<SafeAuditInput[]>;
  findExpiredSessions(now: Date, limit: number): Promise<SessionRecord[]>;
  findDueDocuments(now: Date, limit: number): Promise<DocumentRecord[]>;
  findRetryableScanDocuments(
    limit: number,
    maximumAttempts: number,
  ): Promise<DocumentRecord[]>;
}
