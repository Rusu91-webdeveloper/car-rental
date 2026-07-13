import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlobNotFoundError } from "@vercel/blob";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrivateDocumentError } from "@/lib/private-documents/domain/errors";
import {
  sha256,
  validateDocumentFile,
} from "@/lib/private-documents/application/file-validation";
import { readPrivateDocumentEnvironment } from "@/lib/private-documents/infrastructure/environment";
import type {
  VercelBlobClient,
  VercelBlobHead,
} from "@/lib/private-documents/infrastructure/vercel-blob-client";
import { isVercelBlobNotFound } from "@/lib/private-documents/infrastructure/vercel-blob-client";
import type { PrivateObjectReference } from "@/lib/private-documents/domain/types";
import { environmentBlobPrefix } from "@/lib/private-documents/storage/vercel-blob-pathname";
import { LocalPrivateDocumentStorage } from "@/lib/private-documents/storage/local-private-storage";
import { VercelBlobPrivateStorageAdapter } from "@/lib/private-documents/storage/vercel-blob-private-storage";

const now = new Date("2026-07-13T12:00:00.000Z");
const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF");
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x49, 0x45, 0x4e, 0x44,
]);

function stream(bytes: Uint8Array, trailing?: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      if (trailing) controller.enqueue(trailing);
      controller.close();
    },
  });
}

function fixture() {
  const objects = new Map<
    string,
    { metadata: VercelBlobHead; bytes: Uint8Array }
  >();
  const calls = {
    grant: vi.fn().mockResolvedValue({ signed: "opaque" }),
    presign: vi.fn().mockResolvedValue({
      presignedUrl: "https://blob.vercel.test/upload?opaque=1",
    }),
    head: vi.fn(async (pathname: string) => objects.get(pathname)?.metadata),
    get: vi.fn(async (pathname: string, input: { useCache: boolean }) => {
      void input;
      const object = objects.get(pathname);
      return object
        ? {
            statusCode: 200 as const,
            stream: stream(object.bytes),
            blob: object.metadata,
          }
        : undefined;
    }),
    delete: vi.fn(async (pathname: string) => {
      objects.delete(pathname);
    }),
    list: vi.fn().mockResolvedValue({ blobs: [], hasMore: false }),
  };
  const client: VercelBlobClient = {
    issueUploadToken: calls.grant,
    presignPut: calls.presign,
    head: calls.head,
    get: calls.get,
    delete: calls.delete,
    list: calls.list,
  };
  const environment = readPrivateDocumentEnvironment({
    NODE_ENV: "test",
    PRIVATE_DOCUMENT_STORAGE_PROVIDER: "vercel-blob-private",
    PRIVATE_DOCUMENT_BLOB_STORE_ID: "store_test",
    BLOB_STORE_ID: "store_test",
    PRIVATE_DOCUMENT_BLOB_REGION: "fra1",
    PRIVATE_DOCUMENT_BLOB_PRIVATE_ACCESS_ATTESTED: "true",
    PRIVATE_DOCUMENT_BLOB_REGION_ATTESTED: "true",
    PRIVATE_DOCUMENT_ENVIRONMENT: "test",
    PRIVATE_DOCUMENT_RECONCILIATION_BATCH_SIZE: "25",
  });
  const adapter = new VercelBlobPrivateStorageAdapter({
    environment,
    client,
    now: () => now,
    sleep: vi.fn().mockResolvedValue(undefined),
    jitter: () => 0,
  });
  return { adapter, calls, objects, client };
}

async function target(adapter: VercelBlobPrivateStorageAdapter) {
  return adapter.createUploadTarget({
    uploadIntentId: "intent_0123456789abcdef",
    normalizedExtension: ".pdf",
    declaredMimeType: "application/pdf",
    maximumBytes: 10 * 1024 * 1024,
    expectedChecksumSha256: "a".repeat(64),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
  });
}

describe("Phase 8E-B Vercel Blob private adapter", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("creates an exact PUT-only, private, non-overwriting ten-minute grant", async () => {
    const { adapter, calls } = fixture();
    const result = await target(adapter);
    expect(result.expiresAt).toEqual(new Date(now.getTime() + 600_000));
    expect(result.delivery).toMatchObject({
      kind: "DIRECT_PUT",
      method: "PUT",
      requiredHeaders: { "content-type": "application/pdf" },
    });
    expect(calls.grant).toHaveBeenCalledWith({
      pathname: result.object.objectKey,
      validUntil: now.getTime() + 600_000,
      allowedContentTypes: ["application/pdf"],
      maximumSizeInBytes: 10 * 1024 * 1024,
    });
    expect(calls.presign).toHaveBeenCalledWith(expect.anything(), {
      pathname: result.object.objectKey,
      validUntil: now.getTime() + 600_000,
      allowedContentTypes: ["application/pdf"],
      maximumSizeInBytes: 10 * 1024 * 1024,
      allowOverwrite: false,
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
    });
  });

  it("reissues an idempotent grant for the same intent and rejects a conflicting repeat", async () => {
    const { adapter } = fixture();
    const first = await target(adapter);
    const repeated = await adapter.createUploadTarget({
      uploadIntentId: "intent_0123456789abcdef",
      normalizedExtension: ".pdf",
      declaredMimeType: "application/pdf",
      maximumBytes: first.maximumBytes,
      expectedChecksumSha256: first.expectedChecksumSha256,
      expiresAt: new Date(now.getTime() + 600_000),
      existing: { targetId: first.targetId, object: first.object },
    });
    expect(repeated.targetId).toBe(first.targetId);
    await expect(
      adapter.createUploadTarget({
        uploadIntentId: "intent_0123456789abcdef",
        normalizedExtension: ".pdf",
        declaredMimeType: "application/pdf",
        maximumBytes: first.maximumBytes,
        expectedChecksumSha256: first.expectedChecksumSha256,
        expiresAt: new Date(now.getTime() + 600_000),
        existing: { targetId: "wrong", object: first.object },
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_IDEMPOTENCY_CONFLICT" });
  });

  it("rejects unsupported runtime MIME and oversize grants", async () => {
    const { adapter } = fixture();
    await expect(
      adapter.createUploadTarget({
        uploadIntentId: "intent_0123456789abcdef",
        normalizedExtension: ".pdf",
        declaredMimeType: "text/plain" as "application/pdf",
        maximumBytes: 10,
        expectedChecksumSha256: "a".repeat(64),
        expiresAt: new Date(now.getTime() + 600_000),
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_MIME_UNSUPPORTED" });
    await expect(
      adapter.createUploadTarget({
        uploadIntentId: "intent_0123456789abcdef",
        normalizedExtension: ".pdf",
        declaredMimeType: "application/pdf",
        maximumBytes: 10 * 1024 * 1024 + 1,
        expectedChecksumSha256: "a".repeat(64),
        expiresAt: new Date(now.getTime() + 600_000),
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_FILE_TOO_LARGE" });
  });

  it("inspects exact provider metadata and retains the ETag discriminator", async () => {
    const { adapter, objects } = fixture();
    const upload = await target(adapter);
    objects.set(upload.object.objectKey, {
      metadata: {
        pathname: upload.object.objectKey,
        size: pdf.length,
        contentType: "application/pdf",
        etag: "etag-1",
        uploadedAt: now,
      },
      bytes: pdf,
    });
    await expect(adapter.inspectObject(upload.object)).resolves.toMatchObject({
      sizeBytes: pdf.length,
      declaredContentType: "application/pdf",
      versionId: "etag-1",
    });
    await expect(
      adapter.inspectObject({ ...upload.object, containerId: "wrong" }),
    ).rejects.toMatchObject({ code: "DOCUMENT_UPLOAD_METADATA_MISMATCH" });
  });

  it("rejects pathname mismatch and oversized provider metadata", async () => {
    const { adapter, calls } = fixture();
    const upload = await target(adapter);
    calls.head.mockResolvedValueOnce({
      pathname: `${upload.object.objectKey}x`,
      size: 1,
      contentType: "application/pdf",
      etag: "etag",
      uploadedAt: now,
    });
    await expect(adapter.inspectObject(upload.object)).rejects.toMatchObject({
      code: "DOCUMENT_UPLOAD_METADATA_MISMATCH",
    });
    calls.head.mockResolvedValueOnce({
      pathname: upload.object.objectKey,
      size: 10 * 1024 * 1024 + 1,
      contentType: "application/pdf",
      etag: "etag",
      uploadedAt: now,
    });
    await expect(adapter.inspectObject(upload.object)).rejects.toMatchObject({
      code: "DOCUMENT_FILE_TOO_LARGE",
    });
  });

  it("retrieves verification bytes without cache and never returns a provider URL", async () => {
    const { adapter, objects, calls } = fixture();
    const upload = await target(adapter);
    objects.set(upload.object.objectKey, {
      metadata: {
        pathname: upload.object.objectKey,
        size: pdf.length,
        contentType: "application/pdf",
        etag: "etag-1",
        uploadedAt: now,
      },
      bytes: pdf,
    });
    expect(
      await adapter.readObjectForVerification(upload.object, 1024),
    ).toEqual(pdf);
    expect(calls.get).toHaveBeenCalledWith(upload.object.objectKey, {
      useCache: false,
    });
    const read = await adapter.openPrivateRead(upload.object);
    expect(read).not.toHaveProperty("url");
    expect(read.metadata).not.toHaveProperty("url");
    await expect(adapter.createShortLivedReadAccess()).rejects.toMatchObject({
      code: "DOCUMENT_PROVIDER_CAPABILITY_UNSUPPORTED",
    });
  });

  it.each([
    ["intent_pdf_0123456789", ".pdf", "application/pdf", pdf, "document.pdf"],
    ["intent_jpeg_0123456789", ".jpg", "image/jpeg", jpeg, "document.jpg"],
    ["intent_png_0123456789", ".png", "image/png", png, "document.png"],
  ] as const)(
    "retrieves and validates exact %s bytes",
    async (intentId, extension, mime, bytes, fileName) => {
      const { adapter, objects } = fixture();
      const upload = await adapter.createUploadTarget({
        uploadIntentId: intentId,
        normalizedExtension: extension,
        declaredMimeType: mime,
        maximumBytes: 1024,
        expectedChecksumSha256: sha256(bytes),
        expiresAt: new Date(now.getTime() + 600_000),
      });
      objects.set(upload.object.objectKey, {
        metadata: {
          pathname: upload.object.objectKey,
          size: bytes.length,
          contentType: mime,
          etag: `etag-${extension}`,
          uploadedAt: now,
        },
        bytes,
      });
      const retrieved = await adapter.readObjectForVerification(
        upload.object,
        1024,
      );
      expect(
        validateDocumentFile({
          originalFileName: fileName,
          declaredMimeType: mime,
          bytes: retrieved,
          expectedChecksumSha256: sha256(bytes),
        }).checksumSha256,
      ).toBe(sha256(bytes));
    },
  );

  it("aborts an oversized streamed response and exposes no bytes in the error", async () => {
    const { adapter, calls } = fixture();
    const upload = await target(adapter);
    calls.get.mockResolvedValueOnce({
      statusCode: 200,
      stream: stream(new Uint8Array(6), new Uint8Array(6)),
      blob: {
        pathname: upload.object.objectKey,
        size: 10,
        contentType: "application/pdf",
        etag: "etag",
        uploadedAt: now,
      },
    });
    try {
      await adapter.readObjectForVerification(upload.object, 10);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PrivateDocumentError);
      expect((error as PrivateDocumentError).code).toBe(
        "DOCUMENT_RESPONSE_TOO_LARGE",
      );
      expect((error as Error).message).not.toContain("0,0,0");
    }
  });

  it("conditionally deletes, verifies absence, and handles already absent objects", async () => {
    const { adapter, objects, calls } = fixture();
    const upload = await target(adapter);
    const reference: PrivateObjectReference = {
      ...upload.object,
      versionId: "etag-1",
    };
    objects.set(reference.objectKey, {
      metadata: {
        pathname: reference.objectKey,
        size: pdf.length,
        contentType: "application/pdf",
        etag: "etag-1",
        uploadedAt: now,
      },
      bytes: pdf,
    });
    await expect(adapter.deleteObject(reference)).resolves.toMatchObject({
      deleted: true,
      alreadyMissing: false,
    });
    expect(calls.delete).toHaveBeenCalledWith(reference.objectKey, {
      ifMatch: "etag-1",
    });
    await expect(adapter.deleteObject(reference)).resolves.toMatchObject({
      deleted: false,
      alreadyMissing: true,
    });
  });

  it("resolves an ambiguous delete by inspecting absence", async () => {
    const { adapter, objects, calls } = fixture();
    const upload = await target(adapter);
    objects.set(upload.object.objectKey, {
      metadata: {
        pathname: upload.object.objectKey,
        size: pdf.length,
        contentType: "application/pdf",
        etag: "etag-1",
        uploadedAt: now,
      },
      bytes: pdf,
    });
    calls.delete.mockImplementationOnce(async (pathname: string) => {
      objects.delete(pathname);
      throw new Error("ambiguous provider response");
    });
    await expect(adapter.deleteObject(upload.object)).resolves.toMatchObject({
      deleted: true,
    });
  });

  it("does not pretend abort revokes a grant and cleanup removes only its exact object", async () => {
    const { adapter, objects, calls } = fixture();
    const upload = await target(adapter);
    await adapter.abortUpload({
      targetId: upload.targetId,
      object: upload.object,
    });
    expect(calls.delete).not.toHaveBeenCalled();
    objects.set(upload.object.objectKey, {
      metadata: {
        pathname: upload.object.objectKey,
        size: pdf.length,
        contentType: "application/pdf",
        etag: "etag-1",
        uploadedAt: now,
      },
      bytes: pdf,
    });
    await expect(
      adapter.cleanupAbandonedUpload({
        targetId: upload.targetId,
        object: upload.object,
      }),
    ).resolves.toBe(true);
  });

  it("lists only a bounded exact environment prefix without deletion", async () => {
    const { adapter, calls } = fixture();
    const prefix = environmentBlobPrefix("test");
    calls.list.mockResolvedValueOnce({
      blobs: [],
      cursor: "next",
      hasMore: true,
    });
    await expect(adapter.listObjects({ prefix, limit: 25 })).resolves.toEqual({
      objects: [],
      cursor: "next",
      hasMore: true,
    });
    expect(calls.delete).not.toHaveBeenCalled();
    await expect(
      adapter.listObjects({ prefix: "private-documents/other/", limit: 1 }),
    ).rejects.toMatchObject({ code: "DOCUMENT_PATHNAME_INVALID" });
    await expect(
      adapter.listObjects({ prefix, limit: 26 }),
    ).rejects.toMatchObject({ code: "DOCUMENT_INTENT_MISMATCH" });
  });

  it("maps provider failures to safe messages without logging credentials", async () => {
    const { adapter, calls } = fixture();
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    calls.grant.mockRejectedValueOnce(new Error("secret-token-and-url"));
    await expect(target(adapter)).rejects.toMatchObject({
      code: "DOCUMENT_PROVIDER_OPERATION_FAILED",
      message: "Private object grant operation failed.",
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("maps retrieval and deletion failures safely without mutating object state", async () => {
    const { adapter, calls, objects } = fixture();
    const upload = await target(adapter);
    objects.set(upload.object.objectKey, {
      metadata: {
        pathname: upload.object.objectKey,
        size: pdf.length,
        contentType: "application/pdf",
        etag: "etag-1",
        uploadedAt: now,
      },
      bytes: pdf,
    });
    calls.get.mockRejectedValue(new Error("private-provider-url"));
    await expect(
      adapter.readObjectForVerification(upload.object, 1024),
    ).rejects.toMatchObject({
      code: "DOCUMENT_PROVIDER_OPERATION_FAILED",
      message: "Private object retrieve operation failed.",
    });
    calls.delete.mockRejectedValue(new Error("delete-secret"));
    await expect(adapter.deleteObject(upload.object)).rejects.toMatchObject({
      code: "DOCUMENT_PROVIDER_OPERATION_FAILED",
      message: "Private object delete operation failed.",
    });
    expect(objects.has(upload.object.objectKey)).toBe(true);
  });

  it("rejects malformed reconciliation results outside the environment", async () => {
    const { adapter, calls } = fixture();
    calls.list.mockResolvedValueOnce({
      blobs: [
        {
          pathname:
            "private-documents/other/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf",
          size: 1,
          etag: "etag",
          uploadedAt: now,
        },
      ],
      hasMore: false,
    });
    await expect(
      adapter.listObjects({
        prefix: environmentBlobPrefix("test"),
        limit: 1,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_PROVIDER_RESPONSE_INVALID" });
  });

  it("keeps provider-neutral inspection/read/delete behavior in parity with local storage", async () => {
    const local = new LocalPrivateDocumentStorage(
      await mkdtemp(join(tmpdir(), "phase8e-parity-")),
      () => now,
    );
    const corrected = await local.createUploadTarget({
      uploadIntentId: "intent_local_fedcba9876",
      normalizedExtension: ".pdf",
      declaredMimeType: "application/pdf",
      maximumBytes: 1024,
      expectedChecksumSha256: sha256(pdf),
      expiresAt: new Date(now.getTime() + 600_000),
    });
    await local.completeStagedUpload(corrected.targetId, pdf);

    const { adapter, objects } = fixture();
    const remote = await target(adapter);
    objects.set(remote.object.objectKey, {
      metadata: {
        pathname: remote.object.objectKey,
        size: pdf.length,
        contentType: "application/pdf",
        etag: "etag-parity",
        uploadedAt: now,
      },
      bytes: pdf,
    });
    for (const [storage, reference] of [
      [local, corrected.object],
      [adapter, remote.object],
    ] as const) {
      expect(await storage.objectExists(reference)).toBe(true);
      expect((await storage.inspectObject(reference))?.sizeBytes).toBe(
        pdf.length,
      );
      expect(await storage.readObjectForVerification(reference, 1024)).toEqual(
        pdf,
      );
      const approved = await storage.markApproved(reference);
      expect(approved.objectKey).toBe(reference.objectKey);
      expect((await storage.deleteObject(approved)).deleted).toBe(true);
      expect(await storage.objectExists(approved)).toBe(false);
    }
    await local.dispose();
  });
});

describe("Phase 8E-C live SDK regression coverage", () => {
  it("normalizes an actual BlobNotFoundError instance even when its name is Error", async () => {
    const error = new BlobNotFoundError();
    expect(error.name).toBe("Error");
    expect(isVercelBlobNotFound(error)).toBe(true);
  });
});
