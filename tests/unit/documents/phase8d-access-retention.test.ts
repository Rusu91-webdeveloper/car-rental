import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  type Capability,
} from "@/lib/authorization/capabilities";
import { DocumentAccessService } from "@/lib/private-documents/application/access-service";
import { DocumentDeletionService } from "@/lib/private-documents/application/deletion-service";
import { DocumentLegalHoldService } from "@/lib/private-documents/application/legal-hold-service";
import type { DocumentRecord } from "@/lib/private-documents/application/repository";
import { sha256 } from "@/lib/private-documents/application/file-validation";
import { FakeRecentAuthenticationVerifier } from "@/lib/private-documents/authorization/recent-auth";
import type { DocumentActor } from "@/lib/private-documents/domain/types";
import { LocalPrivateDocumentStorage } from "@/lib/private-documents/storage/local-private-storage";
import { InMemoryDocumentLifecycleRepository } from "@/lib/private-documents/testing/in-memory-repository";

const now = new Date("2026-07-13T10:00:00.000Z");
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const permission = {
  mayView: true,
  mayDownload: true,
  mayDelete: true,
  mayManageLegalHold: true,
};

describe("Phase 8D restricted access, hold, and deletion", () => {
  let repository: InMemoryDocumentLifecycleRepository;
  let storage: LocalPrivateDocumentStorage;
  let document: DocumentRecord;

  beforeEach(async () => {
    repository = new InMemoryDocumentLifecycleRepository();
    storage = new LocalPrivateDocumentStorage(
      await mkdtemp(join(tmpdir(), "phase8d-access-")),
      () => now,
    );
    const target = await storage.createUploadTarget({
      maximumBytes: 1024,
      expectedChecksumSha256: sha256(jpeg),
      expiresAt: new Date(now.getTime() + 60_000),
    });
    await storage.completeStagedUpload(target.targetId, jpeg);
    const approved = await storage.markApproved(target.object);
    document = {
      id: "document-1",
      customerUserId: "customer-1",
      uploadedById: "customer-1",
      documentTypeId: "identity-type",
      side: "SINGLE",
      slotNumber: 1,
      attemptNumber: 1,
      uploadSessionId: "session-1",
      uploadIntentId: "intent-1",
      configurationReleaseId: "release-1",
      documentPolicyConfigVersionId: "policy-1",
      object: approved,
      validation: {
        normalizedExtension: ".jpg",
        declaredMimeType: "image/jpeg",
        detectedMimeType: "image/jpeg",
        detectedFileType: "JPEG",
        sizeBytes: jpeg.length,
        checksumSha256: sha256(jpeg),
      },
      uploadStatus: "READY",
      scanStatus: "CLEAN",
      scanAttemptCount: 1,
      isCurrent: true,
      retentionUntil: new Date(now.getTime() + 60_000),
      deletionEligibleAt: new Date(now.getTime() + 60_000),
      retentionBasis: "UPLOAD_SESSION_EXPIRY",
      legalHold: false,
      deletionStatus: "RETAINED",
    };
    await repository.createDocument(document);
  });

  afterEach(() => storage.dispose());

  function actor(capabilities: Capability[]): DocumentActor {
    return {
      userId: "reviewer-1",
      capabilities: new Set(capabilities),
      assignedRoleKeys: new Set(["DOCUMENT_REVIEWER"]),
    };
  }

  it("requires exact capability, policy permission, and recent auth", async () => {
    const access = new DocumentAccessService(
      repository,
      storage,
      new FakeRecentAuthenticationVerifier(() => now),
      () => now,
    );
    const grant = await access.issue({
      documentId: document.id,
      actor: actor([CAPABILITIES.DOCUMENTS_DOWNLOAD]),
      permission,
      purpose: "DOWNLOAD",
      authenticatedAt: new Date(now.getTime() - 1_000),
      recentAuthMaximumAgeMs: 60_000,
    });
    expect(grant.oneTime).toBe(true);
    await expect(
      access.issue({
        documentId: document.id,
        actor: { userId: "legacy", role: "ADMIN", capabilities: new Set() },
        permission,
        purpose: "VIEW",
        recentAuthMaximumAgeMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_ACCESS_DENIED" });
    await expect(
      access.issue({
        documentId: document.id,
        actor: actor([CAPABILITIES.DOCUMENTS_DOWNLOAD]),
        permission,
        purpose: "DOWNLOAD",
        authenticatedAt: new Date(now.getTime() - 120_000),
        recentAuthMaximumAgeMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_RECENT_AUTH_REQUIRED" });
    await repository.updateDocument(document.id, {
      uploadStatus: "REJECTED",
      scanStatus: "INFECTED",
      isCurrent: false,
    });
    await expect(
      access.issue({
        documentId: document.id,
        actor: actor([CAPABILITIES.DOCUMENTS_VIEW]),
        permission,
        purpose: "VIEW",
        recentAuthMaximumAgeMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_SCAN_NOT_CLEAN" });
    expect(JSON.stringify(repository.audits)).not.toContain(grant.accessValue);
  });

  it("blocks deletion on hold, then verifies deletion and tombstones metadata", async () => {
    await repository.updateDocument(document.id, {
      retentionUntil: new Date(now.getTime() - 1),
      deletionEligibleAt: new Date(now.getTime() - 1),
    });
    const legalHold = new DocumentLegalHoldService(repository, () => now);
    const deletion = new DocumentDeletionService(
      repository,
      storage,
      () => now,
    );
    const holdActor = actor([CAPABILITIES.DOCUMENTS_LEGAL_HOLD_MANAGE]);
    const hold = await legalHold.apply({
      documentId: document.id,
      actor: holdActor,
      permission,
      reason: "Open incident",
    });
    await expect(
      deletion.request({
        documentId: document.id,
        idempotencyKey: "delete-1",
        actor: actor([CAPABILITIES.DOCUMENTS_DELETE]),
        permission,
        reason: "Retention expired",
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_LEGAL_HOLD_ACTIVE" });
    await legalHold.release({
      holdId: hold.id,
      documentId: document.id,
      expectedRevision: hold.revision,
      actor: holdActor,
      permission,
      reason: "Incident closed",
    });
    const request = await deletion.request({
      documentId: document.id,
      idempotencyKey: "delete-1",
      actor: actor([CAPABILITIES.DOCUMENTS_DELETE]),
      permission,
      reason: "Retention expired",
    });
    expect(request.status).toBe("SCHEDULED");
    const completed = await deletion.process({ idempotencyKey: "delete-1" });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.providerConfirmationRef).toMatch(/^local-delete-/);
    expect(await storage.objectExists(document.object)).toBe(false);
    expect(await repository.getDocument(document.id)).toMatchObject({
      deletionStatus: "DELETED",
      isCurrent: false,
    });
  });
});
