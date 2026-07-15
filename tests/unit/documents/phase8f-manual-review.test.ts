import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CAPABILITIES } from "@/lib/authorization/capabilities";
import { DocumentAccessService } from "@/lib/private-documents/application/access-service";
import { sha256 } from "@/lib/private-documents/application/file-validation";
import { evaluateProductionDocumentHealth } from "@/lib/private-documents/application/health";
import { PrivateDocumentLifecycleService } from "@/lib/private-documents/application/lifecycle-service";
import { ManualDocumentReviewService } from "@/lib/private-documents/application/manual-review-service";
import { PrivateDocumentOperationsMonitoringService } from "@/lib/private-documents/application/operations-monitoring";
import { resolveDocumentReadiness } from "@/lib/private-documents/application/readiness";
import { summarizeDocumentSecuritySignals } from "@/lib/private-documents/application/security-monitoring";
import type { PolicyRecord } from "@/lib/private-documents/application/repository";
import { FakeRecentAuthenticationVerifier } from "@/lib/private-documents/authorization/recent-auth";
import type { DocumentActor } from "@/lib/private-documents/domain/types";
import { DeterministicFakeMalwareScanner } from "@/lib/private-documents/scanning/fake-scanner";
import { LocalPrivateDocumentStorage } from "@/lib/private-documents/storage/local-private-storage";
import { InMemoryDocumentLifecycleRepository } from "@/lib/private-documents/testing/in-memory-repository";

const now = new Date("2026-07-13T12:00:00.000Z");
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const policy: PolicyRecord = {
  configurationReleaseId: "release-manual",
  documentPolicyConfigVersionId: "policy-manual",
  retentionPreferenceDays: 30,
  identityDocumentChoice: "IDENTITY_CARD_ONLY",
  requirements: [
    {
      documentTypeId: "identity-type",
      documentTypeKey: "IDENTITY_CARD",
      mode: "REQUIRED",
      fileCount: 1,
      sides: "SINGLE_FILE",
      uploadStage: "DURING_BOOKING",
    },
  ],
};
const permission = {
  mayView: true,
  mayDownload: true,
  mayDelete: true,
  mayManageLegalHold: true,
};
const evidence = {
  provider: "google" as const,
  authenticatedAt: now,
  serverVerified: true as const,
};

describe("Phase 8F-A manual document review", () => {
  let repository: InMemoryDocumentLifecycleRepository;
  let storage: LocalPrivateDocumentStorage;
  let lifecycle: PrivateDocumentLifecycleService;
  let reviews: ManualDocumentReviewService;
  let access: DocumentAccessService;

  beforeEach(async () => {
    repository = new InMemoryDocumentLifecycleRepository(policy);
    storage = new LocalPrivateDocumentStorage(
      await mkdtemp(join(tmpdir(), "phase8f-manual-")),
      () => now,
    );
    const recent = new FakeRecentAuthenticationVerifier(() => now);
    lifecycle = new PrivateDocumentLifecycleService(
      repository,
      storage,
      new DeterministicFakeMalwareScanner(() => now),
      () => now,
      3,
      "MANUAL_REVIEW",
    );
    reviews = new ManualDocumentReviewService(repository, recent, 600_000, () => now);
    access = new DocumentAccessService(repository, storage, recent, () => now);
  });

  afterEach(() => storage.dispose());

  function actor(
    capabilities = [
      CAPABILITIES.DOCUMENTS_VIEW,
      CAPABILITIES.DOCUMENTS_REVIEW,
      CAPABILITIES.DOCUMENTS_REQUEST_REPLACEMENT,
    ],
  ): DocumentActor {
    return {
      userId: "reviewer-1",
      capabilities: new Set(capabilities),
      assignedRoleKeys: new Set(["DOCUMENT_REVIEWER"]),
    };
  }

  async function upload(idempotencyKey: string, predecessorId?: string) {
    const session =
      [...repository.sessions.values()][0] ??
      (await lifecycle.createDocumentUploadSession({
        customerUserId: "customer-1",
        carId: "car-1",
        pickupAt: new Date("2026-07-14T12:00:00Z"),
        returnAt: new Date("2026-07-16T12:00:00Z"),
        locale: "en",
      }));
    const base = {
      sessionId: session.id,
      customerUserId: "customer-1",
      documentTypeId: "identity-type",
      side: "SINGLE" as const,
      slotNumber: 1,
      originalFileName: "synthetic.jpg",
      declaredMimeType: "image/jpeg",
      expectedSizeBytes: jpeg.length,
      expectedChecksumSha256: sha256(jpeg),
      idempotencyKey,
    };
    const created = predecessorId
      ? await lifecycle.requestDocumentReplacement({
          ...base,
          priorDocumentId: predecessorId,
        })
      : await lifecycle.createDocumentUploadIntent(base);
    await lifecycle.stageDisposableUpload(created.intent.id, "customer-1", jpeg);
    const document = await lifecycle.completeDocumentUpload({
      intentId: created.intent.id,
      customerUserId: "customer-1",
    });
    return { session, document };
  }

  it("moves valid files to pending review without CLEAN or READY evidence", async () => {
    const { session, document } = await upload("manual-pending");
    expect(document).toMatchObject({
      uploadStatus: "TECHNICALLY_VALID",
      scanStatus: "NOT_AVAILABLE",
      scanAttemptCount: 0,
      manualReviewStatus: "PENDING_REVIEW",
      reviewRevision: 0,
    });
    expect(await repository.listReviewDecisions(document.id)).toEqual([]);
    expect(
      repository.audits.some((event) => event.action === "document.scan_requested"),
    ).toBe(false);
    expect(
      resolveDocumentReadiness({
        session,
        documents: [document],
        now,
        mode: "MANUAL_REVIEW",
      }),
    ).toMatchObject({ ready: false, code: "DOCUMENT_PENDING_REVIEW" });
  });

  it("never admits malformed bytes to manual review", async () => {
    const session = await lifecycle.createDocumentUploadSession({
      customerUserId: "customer-1",
      carId: "car-1",
      pickupAt: new Date("2026-07-14T12:00:00Z"),
      returnAt: new Date("2026-07-16T12:00:00Z"),
      locale: "en",
    });
    const malformed = new Uint8Array([1, 2, 3, 4]);
    const { intent } = await lifecycle.createDocumentUploadIntent({
      sessionId: session.id,
      customerUserId: "customer-1",
      documentTypeId: "identity-type",
      side: "SINGLE",
      slotNumber: 1,
      originalFileName: "synthetic.jpg",
      declaredMimeType: "image/jpeg",
      expectedSizeBytes: malformed.length,
      expectedChecksumSha256: sha256(malformed),
      idempotencyKey: "manual-malformed",
    });
    await lifecycle.stageDisposableUpload(intent.id, "customer-1", malformed);
    await expect(
      lifecycle.completeDocumentUpload({
        intentId: intent.id,
        customerUserId: "customer-1",
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_SIGNATURE_INVALID" });
    expect(repository.documents.size).toBe(0);
  });

  it("requires restricted capability and fresh server authentication", async () => {
    const { document } = await upload("manual-auth");
    await expect(
      reviews.approveDocument({
        documentId: document.id,
        expectedReviewRevision: 0,
        actor: { userId: "legacy", role: "ADMIN", capabilities: actor().capabilities },
        permission,
        evidence,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_ACCESS_DENIED" });
    await expect(
      reviews.approveDocument({
        documentId: document.id,
        expectedReviewRevision: 0,
        actor: actor([CAPABILITIES.DOCUMENTS_VIEW]),
        permission,
        evidence,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_ACCESS_DENIED" });
    await expect(
      reviews.approveDocument({
        documentId: document.id,
        expectedReviewRevision: 0,
        actor: actor(),
        permission,
      }),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_EVIDENCE_MISSING" });
    await expect(
      reviews.approveDocument({
        documentId: document.id,
        expectedReviewRevision: 0,
        actor: actor(),
        permission,
        evidence: {
          ...evidence,
          authenticatedAt: new Date(now.getTime() - 601_000),
        },
      }),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_EXPIRED" });
  });

  it("approves exactly once and retains authoritative history", async () => {
    const { session, document } = await upload("manual-approve");
    const attempts = await Promise.allSettled([
      reviews.approveDocument({
        documentId: document.id,
        expectedReviewRevision: 0,
        actor: actor(),
        permission,
        evidence,
      }),
      reviews.approveDocument({
        documentId: document.id,
        expectedReviewRevision: 0,
        actor: actor(),
        permission,
        evidence,
      }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const approved = await repository.getDocument(document.id);
    expect(approved).toMatchObject({
      manualReviewStatus: "APPROVED",
      reviewRevision: 1,
      uploadStatus: "TECHNICALLY_VALID",
      scanStatus: "NOT_AVAILABLE",
      isCurrent: true,
    });
    expect(await repository.listReviewDecisions(document.id)).toHaveLength(1);
    expect(
      resolveDocumentReadiness({
        session,
        documents: [approved!],
        now,
        mode: "MANUAL_REVIEW",
      }),
    ).toMatchObject({ ready: true, code: "DOCUMENT_READY" });
  });

  it("validates reasons and promotes only an approved replacement", async () => {
    const initial = await upload("manual-initial");
    const prior = await reviews.approveDocument({
      documentId: initial.document.id,
      expectedReviewRevision: 0,
      actor: actor(),
      permission,
      evidence,
    });
    const rejectedUpload = await upload("manual-rejected", prior.id);
    await expect(
      reviews.rejectDocument({
        documentId: rejectedUpload.document.id,
        expectedReviewRevision: 0,
        actor: actor(),
        permission,
        evidence,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_REVIEW_REASON_REQUIRED" });
    const replacementRequired = await reviews.requestDocumentReplacement({
      documentId: rejectedUpload.document.id,
      expectedReviewRevision: 0,
      actor: actor(),
      permission,
      evidence,
      reasonCode: "UNREADABLE",
    });
    expect(replacementRequired.manualReviewStatus).toBe(
      "REPLACEMENT_REQUIRED",
    );
    expect((await repository.getDocument(prior.id))?.isCurrent).toBe(true);
    const retry = await upload("manual-retry", prior.id);
    const promoted = await reviews.approveDocument({
      documentId: retry.document.id,
      expectedReviewRevision: 0,
      actor: actor(),
      permission,
      evidence,
    });
    expect(promoted.isCurrent).toBe(true);
    expect((await repository.getDocument(prior.id))?.isCurrent).toBe(false);
  });

  it("protects pending previews and approved downloads", async () => {
    const { document } = await upload("manual-access");
    const preview = await access.open({
      documentId: document.id,
      actor: actor(),
      permission,
      purpose: "VIEW",
      evidence,
      recentAuthMaximumAgeMs: 600_000,
    });
    expect(preview.read.metadata.sizeBytes).toBe(jpeg.length);
    await reviews.approveDocument({
      documentId: document.id,
      expectedReviewRevision: 0,
      actor: actor(),
      permission,
      evidence,
    });
    await expect(
      access.open({
        documentId: document.id,
        actor: actor([CAPABILITIES.DOCUMENTS_VIEW]),
        permission,
        purpose: "DOWNLOAD",
        evidence,
        recentAuthMaximumAgeMs: 600_000,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_ACCESS_DENIED" });
  });

  it("manual production health ignores scanner readiness but requires operators", async () => {
    const storageHealth = {
      ...storage,
      providerKey: "vercel-blob-private",
      verifyProviderConfiguration: async () => ({
        configured: true,
        privateAccess: true,
        productionReady: true,
        providerKey: "vercel-blob-private",
        region: "fra1",
        issues: [],
      }),
    } as unknown as LocalPrivateDocumentStorage;
    const health = await evaluateProductionDocumentHealth({
      storage: storageHealth,
      reviewMode: "MANUAL_REVIEW",
      recentAuthenticationOperational: true,
      reviewerRoleAssigned: false,
      downloaderRoleAssigned: true,
      downloadsEnabled: true,
      reviewQueueOperational: true,
      technicalValidationOperational: true,
      auditPersistenceOperational: true,
      cleanupWorkerOperational: true,
      retentionWorkerOperational: true,
      deletionWorkerOperational: true,
      policyAndRetentionConfirmed: true,
      localAdapterDisabled: true,
      scannerPathDisabled: true,
      provisionalBlockersResolved: true,
    });
    expect(health.productionReady).toBe(false);
    expect(health.codes).toContain("DOCUMENT_REVIEWER_ROLE_UNASSIGNED");
    expect(health.codes).not.toContain("DOCUMENT_PRODUCTION_SCANNER_NOT_CONFIGURED");
  });

  it("reports bounded review backlog and sanitized security signals", async () => {
    await upload("manual-monitoring");
    const operations = new PrivateDocumentOperationsMonitoringService(
      repository,
      storage,
      () => now,
    );
    expect(
      await operations.inspectReviewBacklog({ alertCount: 1 }),
    ).toMatchObject({ pending: 1, alert: true });
    await repository.audit({
      action: "document.access_denied",
      targetType: "CustomerDocument",
      targetId: "synthetic",
      metadata: { legacyCompatibilityAttempt: true },
    });
    expect(summarizeDocumentSecuritySignals(repository.audits)).toMatchObject({
      unauthorizedAccessAttempts: 1,
      legacyAdministratorAttempts: 1,
    });
    expect(JSON.stringify(repository.audits)).not.toContain("opaque-");
  });
});
