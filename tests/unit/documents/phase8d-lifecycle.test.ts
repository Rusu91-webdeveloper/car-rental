import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "@/lib/private-documents/application/file-validation";
import { PrivateDocumentLifecycleService } from "@/lib/private-documents/application/lifecycle-service";
import { resolveDocumentReadiness } from "@/lib/private-documents/application/readiness";
import type { PolicyRecord } from "@/lib/private-documents/application/repository";
import { DeterministicFakeMalwareScanner } from "@/lib/private-documents/scanning/fake-scanner";
import { LocalPrivateDocumentStorage } from "@/lib/private-documents/storage/local-private-storage";
import { InMemoryDocumentLifecycleRepository } from "@/lib/private-documents/testing/in-memory-repository";

const now = new Date("2026-07-13T10:00:00.000Z");
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const policy: PolicyRecord = {
  configurationReleaseId: "release-active",
  documentPolicyConfigVersionId: "document-policy-v1",
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

describe("Phase 8D provider-neutral lifecycle", () => {
  let repository: InMemoryDocumentLifecycleRepository;
  let storage: LocalPrivateDocumentStorage;
  let service: PrivateDocumentLifecycleService;

  beforeEach(async () => {
    repository = new InMemoryDocumentLifecycleRepository(policy);
    storage = new LocalPrivateDocumentStorage(
      await mkdtemp(join(tmpdir(), "phase8d-lifecycle-")),
      () => now,
    );
    service = new PrivateDocumentLifecycleService(
      repository,
      storage,
      new DeterministicFakeMalwareScanner(() => now),
      () => now,
    );
  });

  afterEach(() => storage.dispose());

  async function sessionAndIntent(
    idempotencyKey: string,
    priorDocumentId?: string,
  ) {
    const session =
      [...repository.sessions.values()][0] ??
      (await service.createDocumentUploadSession({
        customerUserId: "customer-1",
        carId: "car-1",
        pickupAt: new Date("2026-07-14T10:00:00Z"),
        returnAt: new Date("2026-07-16T10:00:00Z"),
        locale: "en",
      }));
    const input = {
      sessionId: session.id,
      customerUserId: "customer-1",
      documentTypeId: "identity-type",
      side: "SINGLE" as const,
      slotNumber: 1,
      originalFileName: "identity.jpg",
      declaredMimeType: "image/jpeg",
      expectedSizeBytes: jpeg.length,
      expectedChecksumSha256: sha256(jpeg),
      idempotencyKey,
    };
    const created = priorDocumentId
      ? await service.requestDocumentReplacement({ ...input, priorDocumentId })
      : await service.createDocumentUploadIntent(input);
    await service.stageDisposableUpload(created.intent.id, "customer-1", jpeg);
    return { session, ...created };
  }

  it("creates clean evidence and produces a ready policy decision", async () => {
    const { session, intent } = await sessionAndIntent("intent-clean");
    const document = await service.completeDocumentUpload({
      intentId: intent.id,
      customerUserId: "customer-1",
      scanDirective: "CLEAN",
    });
    expect(document).toMatchObject({
      uploadStatus: "READY",
      scanStatus: "CLEAN",
      isCurrent: true,
      configurationReleaseId: policy.configurationReleaseId,
      documentPolicyConfigVersionId: policy.documentPolicyConfigVersionId,
    });
    expect(document.object.namespace).toBe("approved");
    expect(
      resolveDocumentReadiness({
        session,
        documents: await repository.listSessionDocuments(session.id),
        now,
      }),
    ).toMatchObject({ ready: true, code: "DOCUMENT_READY" });
    expect(
      repository.audits.some(
        (audit) => audit.action === "document.became_clean",
      ),
    ).toBe(true);
  });

  it("keeps the prior clean document current until a clean replacement promotes", async () => {
    const initial = await sessionAndIntent("intent-initial");
    const prior = await service.completeDocumentUpload({
      intentId: initial.intent.id,
      customerUserId: "customer-1",
      scanDirective: "CLEAN",
    });
    const infected = await sessionAndIntent("intent-infected", prior.id);
    const rejected = await service.completeDocumentUpload({
      intentId: infected.intent.id,
      customerUserId: "customer-1",
      scanDirective: "INFECTED",
    });
    expect(rejected).toMatchObject({
      uploadStatus: "REJECTED",
      isCurrent: false,
    });
    expect((await repository.getDocument(prior.id))?.isCurrent).toBe(true);

    const retry = await sessionAndIntent("intent-retry", prior.id);
    const promoted = await service.completeDocumentUpload({
      intentId: retry.intent.id,
      customerUserId: "customer-1",
      scanDirective: "CLEAN",
    });
    expect(promoted).toMatchObject({
      uploadStatus: "READY",
      isCurrent: true,
      replacesDocumentId: prior.id,
      attemptNumber: 3,
    });
    expect((await repository.getDocument(prior.id))?.isCurrent).toBe(false);
    expect(await service.listDocumentReplacementHistory(prior.id)).toHaveLength(
      3,
    );
    await expect(
      repository.promoteReplacement(prior.id, promoted.id, promoted.object),
    ).rejects.toMatchObject({ code: "DOCUMENT_IDEMPOTENCY_CONFLICT" });
  });

  it("is idempotent for matching intent and terminal completion", async () => {
    const { session, intent } = await sessionAndIntent("intent-idempotent");
    const duplicate = await service.createDocumentUploadIntent({
      sessionId: session.id,
      customerUserId: "customer-1",
      documentTypeId: "identity-type",
      side: "SINGLE",
      slotNumber: 1,
      originalFileName: "identity.jpg",
      declaredMimeType: "image/jpeg",
      expectedSizeBytes: jpeg.length,
      expectedChecksumSha256: sha256(jpeg),
      idempotencyKey: "intent-idempotent",
    });
    expect(duplicate.intent.id).toBe(intent.id);
    const first = await service.completeDocumentUpload({
      intentId: intent.id,
      customerUserId: "customer-1",
      scanDirective: "CLEAN",
    });
    expect(
      await service.completeDocumentUpload({
        intentId: intent.id,
        customerUserId: "customer-1",
        scanDirective: "CLEAN",
      }),
    ).toEqual(first);
  });

  it("resumes an unfinished matching upload even when the browser retry key changes", async () => {
    const session = await service.createDocumentUploadSession({
      customerUserId: "customer-1",
      carId: "car-1",
      pickupAt: new Date("2026-07-14T10:00:00Z"),
      returnAt: new Date("2026-07-16T10:00:00Z"),
      locale: "en",
    });
    const input = {
      sessionId: session.id,
      customerUserId: "customer-1",
      documentTypeId: "identity-type",
      side: "SINGLE" as const,
      slotNumber: 1,
      originalFileName: "identity.jpg",
      declaredMimeType: "image/jpeg",
      expectedSizeBytes: jpeg.length,
      expectedChecksumSha256: sha256(jpeg),
    };
    const initial = await service.createDocumentUploadIntent({
      ...input,
      idempotencyKey: "initial-browser-upload-key",
    });

    const resumed = await service.createDocumentUploadIntent({
      ...input,
      idempotencyKey: "replacement-browser-retry-key",
    });

    expect(resumed.intent.id).toBe(initial.intent.id);
    expect(resumed.uploadTarget.targetId).toBe(initial.uploadTarget.targetId);
  });

  it("keeps transient scan failure inaccessible and retries within the bound", async () => {
    const { intent } = await sessionAndIntent("intent-timeout");
    const timedOut = await service.completeDocumentUpload({
      intentId: intent.id,
      customerUserId: "customer-1",
      scanDirective: "TIMEOUT",
    });
    expect(timedOut).toMatchObject({
      uploadStatus: "VERIFYING",
      scanStatus: "TIMEOUT",
      scanAttemptCount: 1,
    });
    const clean = await service.retryFailedDocumentScan(timedOut.id);
    expect(clean).toMatchObject({
      uploadStatus: "READY",
      scanStatus: "CLEAN",
      scanAttemptCount: 2,
    });
  });
});
