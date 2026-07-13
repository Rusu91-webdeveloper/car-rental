import type { BatchResult } from "../domain/types";
import type { DocumentLifecycleRepository } from "./repository";
import type { PrivateDocumentStorage } from "../storage/contracts";
import { DocumentDeletionService } from "./deletion-service";

export class DocumentCleanupService {
  constructor(
    private readonly repository: DocumentLifecycleRepository,
    private readonly storage: PrivateDocumentStorage,
    private readonly deletion: DocumentDeletionService,
    private readonly retryScan: (documentId: string) => Promise<unknown>,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async expireUploadSessions(limit = 50): Promise<BatchResult> {
    const sessions = await this.repository.findExpiredSessions(
      this.now(),
      Math.min(limit, 100),
    );
    const result: BatchResult = {
      examined: sessions.length,
      succeeded: 0,
      failed: 0,
      issues: [],
    };
    for (const session of sessions)
      try {
        await this.repository.updateSession(session.id, session.revision, {
          status: "EXPIRED",
          revision: session.revision + 1,
        });
        result.succeeded++;
      } catch {
        result.failed++;
        result.issues.push({ id: session.id, code: "SESSION_EXPIRE_FAILED" });
      }
    return result;
  }
  async cleanupAbandonedUploadObjects(limit = 50): Promise<BatchResult> {
    const sessions = await this.repository.findExpiredSessions(
      this.now(),
      Math.min(limit, 100),
    );
    const intents = (
      await Promise.all(
        sessions.map((session) =>
          this.repository.listSessionIntents(session.id),
        ),
      )
    )
      .flat()
      .slice(0, 100);
    const result: BatchResult = {
      examined: intents.length,
      succeeded: 0,
      failed: 0,
      issues: [],
    };
    for (const intent of intents)
      try {
        if (
          ["CLEAN", "REJECTED", "FAILED", "ABORTED", "EXPIRED"].includes(
            intent.status,
          )
        )
          continue;
        await this.storage.cleanupAbandonedUpload({
          targetId: intent.targetId,
          object: intent.object,
        });
        await this.repository.updateIntent(intent.id, intent.revision, {
          status: "EXPIRED",
          revision: intent.revision + 1,
        });
        await this.repository.audit({
          action: "document.cleanup_performed",
          targetType: "DocumentUploadIntent",
          targetId: intent.id,
        });
        result.succeeded++;
      } catch {
        result.failed++;
        result.issues.push({
          id: intent.id,
          code: "ABANDONED_UPLOAD_CLEANUP_FAILED",
        });
      }
    return result;
  }
  async processDueDocumentDeletions(limit = 25): Promise<BatchResult> {
    const documents = await this.repository.findDueDocuments(
      this.now(),
      Math.min(limit, 50),
    );
    return {
      examined: documents.length,
      succeeded: 0,
      failed: 0,
      issues: documents.map((document) => ({
        id: document.id,
        code: "DELETION_REQUEST_REQUIRED",
      })),
    };
  }
  async retryFailedScans(
    limit = 25,
    maximumAttempts = 3,
  ): Promise<BatchResult> {
    const documents = await this.repository.findRetryableScanDocuments(
      Math.min(limit, 50),
      maximumAttempts,
    );
    const result: BatchResult = {
      examined: documents.length,
      succeeded: 0,
      failed: 0,
      issues: [],
    };
    for (const document of documents)
      try {
        await this.retryScan(document.id);
        result.succeeded++;
      } catch {
        result.failed++;
        result.issues.push({ id: document.id, code: "SCAN_RETRY_FAILED" });
      }
    return result;
  }
  async retryFailedDeletions(keys: string[]): Promise<BatchResult> {
    const result: BatchResult = {
      examined: keys.length,
      succeeded: 0,
      failed: 0,
      issues: [],
    };
    for (const key of keys.slice(0, 50))
      try {
        await this.deletion.process({ idempotencyKey: key });
        result.succeeded++;
      } catch {
        result.failed++;
        result.issues.push({ id: key, code: "DELETION_RETRY_FAILED" });
      }
    return result;
  }
}
