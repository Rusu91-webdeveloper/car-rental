import { createHash } from "node:crypto";
import type { PrivateDocumentEnvironment } from "../infrastructure/environment";
import type {
  VercelBlobClient,
  VercelBlobGet,
  VercelBlobHead,
} from "../infrastructure/vercel-blob-client";
import { vercelBlobClient } from "../infrastructure/vercel-blob-client";
import { mapVercelBlobError } from "../infrastructure/vercel-blob-errors";
import { documentError, PrivateDocumentError } from "../domain/errors";
import type {
  PrivateObjectMetadata,
  PrivateObjectReference,
} from "../domain/types";
import type { PrivateDocumentStorage, StorageHealth } from "./contracts";
import {
  assertVercelBlobPathname,
  createVercelBlobPathname,
  environmentBlobPrefix,
} from "./vercel-blob-pathname";

const PROVIDER_KEY = "vercel-blob-private";

export interface VercelBlobAdapterOptions {
  environment: PrivateDocumentEnvironment;
  client?: VercelBlobClient;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  jitter?: () => number;
  safeOperationAttempts?: number;
}

export class VercelBlobPrivateStorageAdapter implements PrivateDocumentStorage {
  readonly providerKey = PROVIDER_KEY;
  private readonly client: VercelBlobClient;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly jitter: () => number;
  private readonly safeOperationAttempts: number;

  constructor(private readonly options: VercelBlobAdapterOptions) {
    this.client = options.client ?? vercelBlobClient;
    this.now = options.now ?? (() => new Date());
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.jitter = options.jitter ?? Math.random;
    this.safeOperationAttempts = Math.max(
      1,
      Math.min(options.safeOperationAttempts ?? 2, 3),
    );
    if (options.environment.storageProvider !== PROVIDER_KEY)
      documentError(
        "DOCUMENT_PROVIDER_STORE_MISMATCH",
        "Vercel Blob adapter was not selected.",
      );
  }

  private get config() {
    return this.options.environment;
  }

  private assertOperationalConfiguration() {
    const invalid =
      !this.config.expectedStoreId ||
      this.config.expectedStoreId !== this.config.actualStoreId ||
      this.config.expectedRegion !== "fra1" ||
      !Number.isFinite(this.config.maximumUploadBytes) ||
      !Number.isFinite(this.config.uploadGrantSeconds) ||
      (this.config.production &&
        (!this.config.featureEnabled ||
          !this.config.vercelRuntime ||
          !this.config.oidcAvailable ||
          this.config.staticTokenAvailable ||
          !this.config.privateAccessAttested ||
          !this.config.regionAttested));
    if (invalid)
      console.warn(
        "[private-documents] Blob provider configuration unavailable",
        {
          expectedStorePresent: Boolean(this.config.expectedStoreId),
          storeIdsMatch:
            Boolean(this.config.expectedStoreId) &&
            this.config.expectedStoreId === this.config.actualStoreId,
          regionMatches: this.config.expectedRegion === "fra1",
          maximumUploadBytesValid: Number.isFinite(
            this.config.maximumUploadBytes,
          ),
          uploadGrantSecondsValid: Number.isFinite(
            this.config.uploadGrantSeconds,
          ),
          featureEnabled: this.config.featureEnabled,
          vercelRuntime: this.config.vercelRuntime,
          oidcAvailable: this.config.oidcAvailable,
          staticTokenAvailable: this.config.staticTokenAvailable,
          privateAccessAttested: this.config.privateAccessAttested,
          regionAttested: this.config.regionAttested,
        },
      );
    if (invalid)
      documentError(
        "DOCUMENT_PROVIDER_STORE_UNAVAILABLE",
        "Private object provider configuration is incomplete.",
      );
  }

  private assertReference(reference: PrivateObjectReference) {
    if (
      reference.providerKey !== PROVIDER_KEY ||
      reference.region !== this.config.expectedRegion ||
      reference.containerId !== this.config.expectedStoreId ||
      !reference.objectKey.startsWith(
        environmentBlobPrefix(this.config.environmentId),
      )
    )
      documentError(
        "DOCUMENT_UPLOAD_METADATA_MISMATCH",
        "Private object reference does not match this adapter.",
      );
    assertVercelBlobPathname(reference.objectKey);
    return reference.objectKey;
  }

  private reference(
    pathname: string,
    namespace: PrivateObjectReference["namespace"],
    versionId?: string,
  ): PrivateObjectReference {
    if (!this.config.expectedStoreId)
      documentError(
        "DOCUMENT_PROVIDER_STORE_UNAVAILABLE",
        "Expected private object store is not configured.",
      );
    return {
      providerKey: PROVIDER_KEY,
      region: this.config.expectedRegion,
      containerId: this.config.expectedStoreId,
      objectKey: assertVercelBlobPathname(pathname),
      versionId,
      namespace,
    };
  }

  private metadata(
    value: VercelBlobHead,
    namespace: PrivateObjectReference["namespace"],
  ): PrivateObjectMetadata {
    const reference = this.reference(value.pathname, namespace, value.etag);
    return {
      ...reference,
      sizeBytes: value.size,
      declaredContentType: value.contentType || undefined,
      updatedAt: value.uploadedAt,
    };
  }

  private async safeOperation<T>(
    operation: "inspect" | "retrieve" | "list",
    task: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await task();
      } catch (error) {
        const mapped = mapVercelBlobError(error, operation);
        if (!mapped.retryable || attempt >= this.safeOperationAttempts)
          throw mapped;
        await this.sleep(20 * attempt + Math.floor(this.jitter() * 10));
      }
    }
  }

  async verifyProviderConfiguration(): Promise<StorageHealth> {
    const issues = new Set(this.config.issues);
    if (this.config.expectedStoreId !== this.config.actualStoreId)
      issues.add("DOCUMENT_BLOB_STORE_MISMATCH");
    if (this.config.expectedRegion !== "fra1")
      issues.add("DOCUMENT_BLOB_REGION_MISMATCH");
    if (!this.config.privateAccessAttested)
      issues.add("DOCUMENT_BLOB_PRIVATE_ACCESS_UNVERIFIED");
    if (!this.config.regionAttested)
      issues.add("DOCUMENT_BLOB_REGION_UNVERIFIED");
    if (this.config.production && !this.config.oidcAvailable)
      issues.add("DOCUMENT_BLOB_OIDC_UNAVAILABLE");
    if (this.config.production && this.config.staticTokenAvailable)
      issues.add("DOCUMENT_PRODUCTION_STATIC_TOKEN_UNSUPPORTED");
    if (this.config.production && !this.config.vercelRuntime)
      issues.add("DOCUMENT_VERCEL_RUNTIME_UNAVAILABLE");
    const configured =
      Boolean(this.config.expectedStoreId) &&
      this.config.expectedStoreId === this.config.actualStoreId &&
      this.config.expectedRegion === "fra1";
    if (configured && (!this.config.production || this.config.oidcAvailable)) {
      try {
        await this.safeOperation("list", () =>
          this.client.list({
            prefix: environmentBlobPrefix(this.config.environmentId),
            limit: 1,
          }),
        );
      } catch (error) {
        issues.add(
          error instanceof PrivateDocumentError
            ? error.code
            : "DOCUMENT_PROVIDER_OPERATION_FAILED",
        );
      }
    }
    const productionReady =
      this.config.production &&
      configured &&
      this.config.featureEnabled &&
      this.config.vercelRuntime &&
      this.config.oidcAvailable &&
      !this.config.staticTokenAvailable &&
      this.config.privateAccessAttested &&
      this.config.regionAttested &&
      issues.size === 0;
    return {
      configured: configured && issues.size === 0,
      privateAccess: this.config.privateAccessAttested,
      productionReady,
      providerKey: PROVIDER_KEY,
      region: this.config.expectedRegion,
      issues: [...issues],
    };
  }

  async createUploadTarget(input: {
    uploadIntentId: string;
    normalizedExtension: ".pdf" | ".jpg" | ".jpeg" | ".png";
    declaredMimeType: "application/pdf" | "image/jpeg" | "image/png";
    maximumBytes: number;
    expectedChecksumSha256: string;
    expiresAt: Date;
    existing?: { targetId: string; object: PrivateObjectReference };
  }) {
    this.assertOperationalConfiguration();
    if (
      !["application/pdf", "image/jpeg", "image/png"].includes(
        input.declaredMimeType,
      )
    )
      documentError("DOCUMENT_MIME_UNSUPPORTED", "Upload MIME is invalid.");
    if (
      input.maximumBytes < 1 ||
      input.maximumBytes > this.config.maximumUploadBytes
    )
      documentError("DOCUMENT_FILE_TOO_LARGE", "Upload limit is invalid.");
    const pathname = createVercelBlobPathname({
      environmentId: this.config.environmentId,
      uploadIntentId: input.uploadIntentId,
      normalizedExtension: input.normalizedExtension,
    });
    if (input.existing) {
      this.assertReference(input.existing.object);
      if (
        input.existing.object.objectKey !== pathname ||
        input.existing.targetId !== this.targetId(pathname)
      )
        documentError(
          "DOCUMENT_IDEMPOTENCY_CONFLICT",
          "Upload target repeat conflicts with its original intent.",
        );
    }
    const validUntil = Math.min(
      input.expiresAt.getTime(),
      this.now().getTime() + this.config.uploadGrantSeconds * 1000,
    );
    if (validUntil <= this.now().getTime())
      documentError("DOCUMENT_SESSION_EXPIRED", "Upload target expired.");
    try {
      // Grant creation is deliberately not retried after an ambiguous response.
      const token = await this.client.issueUploadToken({
        pathname,
        validUntil,
        allowedContentTypes: [input.declaredMimeType],
        maximumSizeInBytes: input.maximumBytes,
      });
      const result = await this.client.presignPut(token, {
        pathname,
        validUntil,
        allowedContentTypes: [input.declaredMimeType],
        maximumSizeInBytes: input.maximumBytes,
        allowOverwrite: false,
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
      });
      const url = new URL(result.presignedUrl);
      if (url.protocol !== "https:" || url.username || url.password)
        documentError(
          "DOCUMENT_PROVIDER_RESPONSE_INVALID",
          "Upload grant response is malformed.",
        );
      return {
        targetId: this.targetId(pathname),
        object: this.reference(pathname, "quarantine"),
        expiresAt: new Date(validUntil),
        maximumBytes: input.maximumBytes,
        expectedChecksumSha256: input.expectedChecksumSha256,
        delivery: {
          kind: "DIRECT_PUT" as const,
          accessValue: result.presignedUrl,
          method: "PUT" as const,
          requiredHeaders: { "content-type": input.declaredMimeType },
        },
      };
    } catch (error) {
      throw mapVercelBlobError(error, "grant");
    }
  }

  private targetId(pathname: string) {
    return `vercel-put-${createHash("sha256").update(pathname).digest("hex")}`;
  }

  async completeStagedUpload(): Promise<never> {
    documentError(
      "DOCUMENT_PROVIDER_CAPABILITY_UNSUPPORTED",
      "Vercel Blob uses direct presigned uploads.",
    );
  }

  async inspectObject(reference: PrivateObjectReference) {
    this.assertOperationalConfiguration();
    const pathname = this.assertReference(reference);
    const result = await this.safeOperation("inspect", () =>
      this.client.head(pathname),
    );
    if (!result) return undefined;
    if (result.pathname !== pathname)
      documentError(
        "DOCUMENT_UPLOAD_METADATA_MISMATCH",
        "Provider returned a different pathname.",
      );
    if (result.size > this.config.maximumUploadBytes)
      documentError("DOCUMENT_FILE_TOO_LARGE", "Stored object is oversized.");
    return this.metadata(result, reference.namespace);
  }

  private async privateGet(
    reference: PrivateObjectReference,
    useCache: boolean,
  ): Promise<VercelBlobGet> {
    this.assertOperationalConfiguration();
    const pathname = this.assertReference(reference);
    const result = await this.safeOperation("retrieve", () =>
      this.client.get(pathname, { useCache }),
    );
    if (!result)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Private object not found.");
    if (result.blob.pathname !== pathname)
      documentError(
        "DOCUMENT_UPLOAD_METADATA_MISMATCH",
        "Provider returned a different pathname.",
      );
    return result;
  }

  async readObjectForVerification(
    reference: PrivateObjectReference,
    maximumBytes: number,
  ) {
    const result = await this.privateGet(reference, false);
    const limit = Math.min(maximumBytes, this.config.maximumUploadBytes);
    if (result.blob.size > limit)
      documentError(
        "DOCUMENT_RESPONSE_TOO_LARGE",
        "Object exceeds read limit.",
      );
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
          await reader.cancel();
          documentError(
            "DOCUMENT_RESPONSE_TOO_LARGE",
            "Object exceeds read limit.",
          );
        }
        chunks.push(value);
      }
      if (total !== result.blob.size)
        documentError(
          "DOCUMENT_UPLOAD_METADATA_MISMATCH",
          "Retrieved size differs from provider metadata.",
        );
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    } finally {
      reader.releaseLock();
      chunks.length = 0;
    }
  }

  async openPrivateRead(reference: PrivateObjectReference) {
    const result = await this.privateGet(reference, false);
    if (result.blob.size > this.config.maximumUploadBytes)
      documentError(
        "DOCUMENT_RESPONSE_TOO_LARGE",
        "Object exceeds read limit.",
      );
    return {
      stream: result.stream,
      metadata: this.metadata(result.blob, reference.namespace),
    };
  }

  async createShortLivedReadAccess(): Promise<never> {
    documentError(
      "DOCUMENT_PROVIDER_CAPABILITY_UNSUPPORTED",
      "Signed private GET URLs are disabled; use authenticated server streaming.",
    );
  }

  async markQuarantined(reference: PrivateObjectReference) {
    this.assertReference(reference);
    const metadata = await this.inspectObject(reference);
    if (!metadata)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Private object not found.");
    return {
      ...reference,
      versionId: metadata.versionId,
      namespace: "quarantine" as const,
    };
  }

  async markApproved(reference: PrivateObjectReference) {
    this.assertReference(reference);
    return { ...reference, namespace: "approved" as const };
  }

  async deleteObject(reference: PrivateObjectReference) {
    const pathname = this.assertReference(reference);
    const current = await this.inspectObject(reference);
    if (!current)
      return {
        deleted: false,
        alreadyMissing: true,
        confirmationReference: this.deletionReference(pathname),
      };
    if (reference.versionId && current.versionId !== reference.versionId)
      documentError(
        "DOCUMENT_UPLOAD_METADATA_MISMATCH",
        "Object version changed before deletion.",
      );
    try {
      await this.client.delete(pathname, {
        ifMatch: reference.versionId ?? current.versionId,
      });
    } catch (error) {
      // Resolve uncertain deletion outcomes by inspecting before any retry.
      if (!(await this.inspectObject(reference)))
        return {
          deleted: true,
          alreadyMissing: false,
          confirmationReference: this.deletionReference(pathname),
        };
      throw mapVercelBlobError(error, "delete");
    }
    if (!(await this.waitForAbsence(reference)))
      documentError(
        "DOCUMENT_DELETION_NOT_VERIFIED",
        "Private object deletion could not be verified.",
      );
    return {
      deleted: true,
      alreadyMissing: false,
      confirmationReference: this.deletionReference(pathname),
    };
  }

  private async waitForAbsence(reference: PrivateObjectReference) {
    for (let attempt = 1; attempt <= this.safeOperationAttempts; attempt++) {
      if (!(await this.inspectObject(reference))) return true;
      if (attempt < this.safeOperationAttempts)
        await this.sleep(25 * attempt + Math.floor(this.jitter() * 10));
    }
    return false;
  }

  private deletionReference(pathname: string) {
    return `vercel-delete-${createHash("sha256").update(pathname).digest("hex").slice(0, 24)}`;
  }

  async objectExists(reference: PrivateObjectReference) {
    return Boolean(await this.inspectObject(reference));
  }

  async abortUpload(input: {
    targetId: string;
    object: PrivateObjectReference;
  }) {
    this.assertReference(input.object);
    if (input.targetId !== this.targetId(input.object.objectKey))
      documentError(
        "DOCUMENT_IDEMPOTENCY_CONFLICT",
        "Upload target does not match its object.",
      );
    // A previously issued single-PUT URL cannot be revoked by this SDK.
    // Application intent expiry is authoritative; cleanup is separate.
  }

  async cleanupAbandonedUpload(input: {
    targetId: string;
    object: PrivateObjectReference;
  }) {
    await this.abortUpload(input);
    const existed = await this.objectExists(input.object);
    if (existed) await this.deleteObject(input.object);
    return existed;
  }

  async listObjects(input: { prefix: string; limit: number; cursor?: string }) {
    this.assertOperationalConfiguration();
    const approvedPrefix = environmentBlobPrefix(this.config.environmentId);
    if (input.prefix !== approvedPrefix)
      documentError(
        "DOCUMENT_PATHNAME_INVALID",
        "Reconciliation prefix is not approved.",
      );
    if (input.limit < 1 || input.limit > this.config.reconciliationBatchSize)
      documentError(
        "DOCUMENT_INTENT_MISMATCH",
        "Reconciliation limit is invalid.",
      );
    const result = await this.safeOperation("list", () =>
      this.client.list(input),
    );
    return {
      objects: result.blobs.map((blob) => {
        if (!blob.pathname.startsWith(approvedPrefix))
          documentError(
            "DOCUMENT_PROVIDER_RESPONSE_INVALID",
            "Provider returned an object outside the approved prefix.",
          );
        return {
          ...this.reference(blob.pathname, "quarantine", blob.etag),
          sizeBytes: blob.size,
          updatedAt: blob.uploadedAt,
        };
      }),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  }
}
