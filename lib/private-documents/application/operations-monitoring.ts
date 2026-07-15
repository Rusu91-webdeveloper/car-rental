import { createHash } from "node:crypto";
import type { BatchResult } from "../domain/types";
import type { PrivateDocumentStorage } from "../storage/contracts";
import type { DocumentLifecycleRepository } from "./repository";

export class PrivateDocumentOperationsMonitoringService {
  constructor(
    private readonly repository: DocumentLifecycleRepository,
    private readonly storage: PrivateDocumentStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async inspectReviewBacklog(input: {
    staleAfterMs?: number;
    alertCount?: number;
  } = {}) {
    const staleAfterMs = Math.max(
      60_000,
      Math.min(input.staleAfterMs ?? 24 * 60 * 60_000, 7 * 24 * 60 * 60_000),
    );
    const [pending, stale] = await Promise.all([
      this.repository.countPendingReviews(),
      this.repository.countPendingReviews(
        new Date(this.now().getTime() - staleAfterMs),
      ),
    ]);
    const alert = stale > 0 || pending >= Math.max(1, input.alertCount ?? 25);
    await this.repository.audit({
      action: alert
        ? "document.review_backlog_alert"
        : "document.review_backlog_observed",
      targetType: "DocumentReviewQueue",
      targetId: "manual-review",
      metadata: { pending, stale, staleAfterMs, alert },
    });
    return { pending, stale, staleAfterMs, alert };
  }

  async reconcileOrphanObjects(input: {
    prefix: string;
    limit?: number;
    cursor?: string;
  }): Promise<BatchResult> {
    const page = await this.storage.listObjects({
      prefix: input.prefix,
      limit: Math.max(1, Math.min(input.limit ?? 50, 100)),
      cursor: input.cursor,
    });
    const result: BatchResult = {
      examined: page.objects.length,
      succeeded: 0,
      failed: 0,
      nextCursor: page.hasMore ? page.cursor : undefined,
      issues: [],
    };
    for (const object of page.objects) {
      const known = await this.repository.hasKnownObject(object);
      if (known) {
        result.succeeded++;
        continue;
      }
      const opaqueReference = createHash("sha256")
        .update(`${object.providerKey}:${object.containerId}:${object.objectKey}`)
        .digest("hex")
        .slice(0, 24);
      result.failed++;
      result.issues.push({ id: opaqueReference, code: "ORPHAN_REVIEW_REQUIRED" });
      await this.repository.audit({
        action: "document.orphan_object_detected",
        targetType: "PrivateObject",
        targetId: opaqueReference,
        metadata: { providerKey: object.providerKey },
      });
    }
    return result;
  }
}
