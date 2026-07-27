import type { DocumentUploadIntent, PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { IntentRecord } from "@/lib/private-documents/application/repository";
import { PrismaDocumentLifecycleRepository } from "@/lib/private-documents/infrastructure/prisma-repository";

const now = new Date("2026-07-27T13:30:00.000Z");

const intent: IntentRecord = {
  id: "replacement-intent",
  uploadSessionId: "session-1",
  documentPolicyConfigVersionId: "policy-1",
  documentTypeId: "identity-card",
  side: "SINGLE",
  slotNumber: 1,
  attemptNumber: 2,
  idempotencyKey: "replacement-intent-idempotency-key",
  originalFileName: "replacement.jpg",
  declaredMimeType: "image/jpeg",
  expectedSizeBytes: 8,
  expectedChecksumSha256: "a".repeat(64),
  targetId: "provider-upload-1",
  object: {
    providerKey: "vercel-blob-private",
    region: "fra1",
    containerId: "private-documents",
    objectKey: "quarantine/replacement-intent.jpg",
    namespace: "quarantine",
  },
  status: "INTENT_CREATED",
  revision: 1,
  expiresAt: now,
  cleanupEligibleAt: now,
  replacesDocumentId: "rejected-document",
};

describe("Prisma document lifecycle repository", () => {
  it("persists and hydrates an upload intent's replacement predecessor", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      createdAt: now,
      updatedAt: now,
      uploadCompletedAt: null,
      verificationStartedAt: null,
      completedAt: null,
      abortedAt: null,
      failureCode: null,
      providerObjectVersionId: null,
    }));
    const db = {
      documentUploadIntent: { create },
    } as unknown as PrismaClient;
    const repository = new PrismaDocumentLifecycleRepository(db);

    const created = await repository.createIntent(intent);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: intent.id,
        replacesDocumentId: "rejected-document",
      }),
    });
    expect(created.replacesDocumentId).toBe("rejected-document");
  });

  it("returns replacement lineage when reading an existing intent", async () => {
    const row = {
      id: intent.id,
      uploadSessionId: intent.uploadSessionId,
      documentPolicyConfigVersionId:
        intent.documentPolicyConfigVersionId,
      documentTypeId: intent.documentTypeId,
      side: intent.side,
      slotNumber: intent.slotNumber,
      attemptNumber: intent.attemptNumber,
      idempotencyKey: intent.idempotencyKey,
      filePolicyVersion: 1,
      originalFileName: intent.originalFileName,
      normalizedExtension: ".jpg",
      declaredMimeType: intent.declaredMimeType,
      expectedSizeBytes: intent.expectedSizeBytes,
      expectedChecksumSha256: intent.expectedChecksumSha256,
      storageProviderId: intent.object.providerKey,
      storageRegion: intent.object.region,
      storageContainerId: intent.object.containerId,
      storageKey: intent.object.objectKey,
      providerUploadId: intent.targetId,
      providerObjectVersionId: null,
      status: intent.status,
      revision: intent.revision,
      expiresAt: intent.expiresAt,
      cleanupEligibleAt: intent.cleanupEligibleAt,
      uploadCompletedAt: null,
      verificationStartedAt: null,
      completedAt: null,
      abortedAt: null,
      failureCode: null,
      replacesDocumentId: "rejected-document",
      createdAt: now,
      updatedAt: now,
    } satisfies DocumentUploadIntent;
    const db = {
      documentUploadIntent: {
        findUnique: vi.fn(async () => row),
      },
    } as unknown as PrismaClient;
    const repository = new PrismaDocumentLifecycleRepository(db);

    await expect(repository.getIntent(intent.id)).resolves.toMatchObject({
      id: intent.id,
      replacesDocumentId: "rejected-document",
    });
  });
});
