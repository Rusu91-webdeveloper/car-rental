import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  sha256,
  validateDocumentFile,
} from "@/lib/private-documents/application/file-validation";
import { PrivateDocumentError } from "@/lib/private-documents/domain/errors";
import { evaluateDocumentInfrastructureHealth } from "@/lib/private-documents/application/health";
import { DeterministicFakeMalwareScanner } from "@/lib/private-documents/scanning/fake-scanner";
import { LocalPrivateDocumentStorage } from "@/lib/private-documents/storage/local-private-storage";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x49, 0x45, 0x4e, 0x44,
]);
const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");

function code(error: unknown) {
  return error instanceof PrivateDocumentError ? error.code : undefined;
}

describe("Phase 8D file validation", () => {
  it.each([
    ["identity.jpg", "image/jpeg", jpeg, "JPEG"],
    ["identity.png", "image/png", png, "PNG"],
    ["identity.pdf", "application/pdf", pdf, "PDF"],
  ] as const)("validates %s from bytes", (name, mime, bytes, detected) => {
    expect(
      validateDocumentFile({
        originalFileName: name,
        declaredMimeType: mime,
        bytes,
        expectedChecksumSha256: sha256(bytes),
      }).detectedFileType,
    ).toBe(detected);
  });

  it.each([
    ["../identity.jpg", "image/jpeg", jpeg, "DOCUMENT_FILENAME_UNSAFE"],
    ["identity.exe.jpg", "image/jpeg", jpeg, "DOCUMENT_FILENAME_UNSAFE"],
    ["identity.png", "image/png", jpeg, "DOCUMENT_MIME_MISMATCH"],
    ["identity.jpg", "image/jpeg", new Uint8Array(), "DOCUMENT_FILE_EMPTY"],
    [
      "identity.pdf",
      "application/pdf",
      new TextEncoder().encode("%PDF-1.4\n/JavaScript\n%%EOF"),
      "DOCUMENT_ACTIVE_CONTENT_REJECTED",
    ],
  ] as const)("rejects an unsafe %s payload", (name, mime, bytes, expected) => {
    try {
      validateDocumentFile({
        originalFileName: name,
        declaredMimeType: mime,
        bytes,
      });
      throw new Error("expected validation failure");
    } catch (error) {
      expect(code(error)).toBe(expected);
    }
  });
});

describe("Phase 8D disposable adapters", () => {
  const stores: LocalPrivateDocumentStorage[] = [];
  afterEach(async () => {
    await Promise.all(stores.splice(0).map((store) => store.dispose()));
  });

  it("keeps opaque objects private, quarantined, and one-time accessible", async () => {
    const root = await mkdtemp(join(tmpdir(), "phase8d-private-"));
    const store = new LocalPrivateDocumentStorage(root);
    stores.push(store);
    const target = await store.createUploadTarget({
      uploadIntentId: "intent-file-storage-1",
      normalizedExtension: ".jpg",
      declaredMimeType: "image/jpeg",
      maximumBytes: 1024,
      expectedChecksumSha256: sha256(jpeg),
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(target.object.objectKey).toMatch(/^[a-f0-9]{48}$/);
    expect(target.object.namespace).toBe("quarantine");
    await store.completeStagedUpload(target.targetId, jpeg);
    const approved = await store.markApproved(target.object);
    const grant = await store.createShortLivedReadAccess(approved, {
      documentId: "document-1",
      requesterId: "reviewer-1",
      purpose: "DOWNLOAD",
      expiresAt: new Date(Date.now() + 60_000),
      oneTime: true,
    });
    expect(await store.redeemLocalAccess(grant.accessValue)).toEqual(jpeg);
    await expect(
      store.redeemLocalAccess(grant.accessValue),
    ).rejects.toMatchObject({
      code: "DOCUMENT_ACCESS_DENIED",
    });
  });

  it("normalizes every fake scan result and reports a production block", async () => {
    const root = await mkdtemp(join(tmpdir(), "phase8d-health-"));
    const store = new LocalPrivateDocumentStorage(root);
    stores.push(store);
    const scanner = new DeterministicFakeMalwareScanner();
    for (const outcome of [
      "CLEAN",
      "INFECTED",
      "ERROR",
      "TIMEOUT",
      "UNSUPPORTED",
      "PASSWORD_PROTECTED",
    ] as const) {
      const request = await scanner.requestScan({
        idempotencyKey: `scan-${outcome}`,
        object: {
          providerKey: "fixture",
          region: "local",
          containerId: "private",
          objectKey: `object-${outcome}`,
          namespace: "quarantine",
        },
        checksumSha256: "a".repeat(64),
        testDirective: outcome,
      });
      const result = await scanner.processScanResult(request.requestId);
      expect(result.outcome).toBe(outcome);
      expect(await scanner.processScanResult(request.requestId)).toEqual(
        result,
      );
    }
    const health = await evaluateDocumentInfrastructureHealth({
      storage: store,
      scanner,
      policyValid: true,
      capabilitiesReady: true,
      retentionReady: true,
      workflowReady: true,
    });
    expect(health.lifecycleReadyForProviderIntegration).toBe(true);
    expect(health.productionReady).toBe(false);
    expect(health.codes).toContain(
      "DOCUMENT_PRODUCTION_STORAGE_NOT_CONFIGURED",
    );
    expect(health.codes).toContain(
      "DOCUMENT_PRODUCTION_SCANNER_NOT_CONFIGURED",
    );
  });
});
