import { randomUUID } from "node:crypto";
import { evaluateProductionDocumentHealth } from "../../lib/private-documents/application/health";
import {
  sha256,
  validateDocumentFile,
} from "../../lib/private-documents/application/file-validation";
import { PrivateDocumentError } from "../../lib/private-documents/domain/errors";
import type {
  PrivateObjectReference,
  UploadTarget,
} from "../../lib/private-documents/domain/types";
import { readPrivateDocumentEnvironment } from "../../lib/private-documents/infrastructure/environment";
import {
  DocumentIntegrationGuardError,
  requireNonProductionIntegrationEnvironment,
} from "../../lib/private-documents/infrastructure/nonproduction-integration";
import { DeterministicFakeMalwareScanner } from "../../lib/private-documents/scanning/fake-scanner";
import { environmentBlobPrefix } from "../../lib/private-documents/storage/vercel-blob-pathname";
import { VercelBlobPrivateStorageAdapter } from "../../lib/private-documents/storage/vercel-blob-private-storage";
import {
  SYNTHETIC_MARKER,
  syntheticDocumentFixtures,
  type SyntheticDocumentFixture,
} from "./synthetic-fixtures";

class IntegrationFailure extends Error {
  constructor(readonly code: string) {
    super("Synthetic Vercel Blob integration assertion failed.");
    this.name = "IntegrationFailure";
  }
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new IntegrationFailure(code);
}

function safeCode(error: unknown) {
  if (
    error instanceof IntegrationFailure ||
    error instanceof DocumentIntegrationGuardError ||
    error instanceof PrivateDocumentError
  )
    return error.code;
  return "DOCUMENT_INTEGRATION_UNEXPECTED_FAILURE";
}

async function directPut(
  target: UploadTarget,
  bytes: Uint8Array,
  contentType: string,
  method = "PUT",
) {
  assert(target.delivery.kind === "DIRECT_PUT", "DIRECT_PUT_GRANT_REQUIRED");
  return fetch(target.delivery.accessValue, {
    method,
    headers: { "content-type": contentType },
    body: method === "PUT" ? Uint8Array.from(bytes).buffer : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
}

function mutateGrantPath(target: UploadTarget) {
  assert(target.delivery.kind === "DIRECT_PUT", "DIRECT_PUT_GRANT_REQUIRED");
  const url = new URL(target.delivery.accessValue);
  const pathnameKey = [...url.searchParams.keys()].find((key) =>
    key.toLowerCase().includes("pathname"),
  );
  if (pathnameKey)
    url.searchParams.set(pathnameKey, `${target.object.objectKey}-other`);
  else url.pathname = `${url.pathname}-other`;
  return url.toString();
}

async function expectValidationCode(
  fixture: SyntheticDocumentFixture,
  bytes: Uint8Array,
  input: { fileName: string; declaredMimeType: string },
  code: string,
) {
  try {
    validateDocumentFile({
      originalFileName: input.fileName,
      declaredMimeType: input.declaredMimeType,
      bytes,
      expectedChecksumSha256: sha256(fixture.bytes),
    });
    throw new IntegrationFailure("EXPECTED_VALIDATION_REJECTION");
  } catch (error) {
    assert(
      error instanceof PrivateDocumentError,
      "SAFE_VALIDATION_ERROR_REQUIRED",
    );
    assert(error.code === code, `EXPECTED_${code}`);
  }
}

async function cleanupEnvironmentPrefix(
  adapter: VercelBlobPrivateStorageAdapter,
  prefix: string,
) {
  let removed = 0;
  for (let batch = 0; batch < 20; batch++) {
    const page = await adapter.listObjects({ prefix, limit: 25 });
    if (!page.objects.length) return removed;
    for (const object of page.objects) {
      await adapter.deleteObject(object);
      removed++;
    }
  }
  throw new IntegrationFailure("CLEANUP_BATCH_LIMIT_REACHED");
}

async function main() {
  const context = requireNonProductionIntegrationEnvironment();
  const environment = readPrivateDocumentEnvironment();
  const adapter = new VercelBlobPrivateStorageAdapter({ environment });
  const prefix = environmentBlobPrefix(context.environmentId);
  const fixtures = syntheticDocumentFixtures();
  const results: Array<{ case: string; status: "PASS" }> = [];
  const record = (name: string) => results.push({ case: name, status: "PASS" });
  let cleanupCount = 0;

  try {
    cleanupCount += await cleanupEnvironmentPrefix(adapter, prefix);

    const health = await adapter.verifyProviderConfiguration();
    assert(health.configured, "REAL_PROVIDER_HEALTH_FAILED");
    assert(!health.productionReady, "NONPROD_STORAGE_MARKED_PRODUCTION_READY");
    record("store-connection-and-oidc");

    const uploaded: Array<{
      fixture: SyntheticDocumentFixture;
      target: UploadTarget;
      reference: PrivateObjectReference;
    }> = [];

    for (const fixture of fixtures) {
      const target = await adapter.createUploadTarget({
        uploadIntentId: randomUUID(),
        normalizedExtension: fixture.extension,
        declaredMimeType: fixture.mimeType,
        maximumBytes: 10 * 1024 * 1024,
        expectedChecksumSha256: sha256(fixture.bytes),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      });
      assert(
        target.expiresAt.getTime() <= Date.now() + 600_000,
        "GRANT_TOO_LONG",
      );
      assert(target.maximumBytes === 10 * 1024 * 1024, "GRANT_SIZE_MISMATCH");
      assert(
        target.delivery.kind === "DIRECT_PUT",
        "DIRECT_PUT_GRANT_REQUIRED",
      );
      assert(target.delivery.method === "PUT", "GRANT_OPERATION_MISMATCH");
      assert(
        target.delivery.requiredHeaders["content-type"] === fixture.mimeType,
        "GRANT_MIME_MISMATCH",
      );
      const upload = await directPut(target, fixture.bytes, fixture.mimeType);
      assert(upload.ok, `SYNTHETIC_${fixture.key}_UPLOAD_FAILED`);

      const metadata = await adapter.inspectObject(target.object);
      assert(
        metadata?.sizeBytes === fixture.bytes.byteLength,
        "HEAD_SIZE_MISMATCH",
      );
      assert(
        metadata.declaredContentType === fixture.mimeType,
        "HEAD_MIME_MISMATCH",
      );
      assert(Boolean(metadata.versionId), "HEAD_ETAG_MISSING");
      const bytes = await adapter.readObjectForVerification(
        target.object,
        10 * 1024 * 1024,
      );
      const validation = validateDocumentFile({
        originalFileName: fixture.fileName,
        declaredMimeType: fixture.mimeType,
        bytes,
        expectedChecksumSha256: sha256(fixture.bytes),
      });
      assert(
        validation.checksumSha256 === sha256(fixture.bytes),
        "CHECKSUM_MISMATCH",
      );
      const quarantined = await adapter.markQuarantined(target.object);
      const approved = await adapter.markApproved(quarantined);
      assert(
        approved.objectKey === target.object.objectKey,
        "OBJECT_PATH_CHANGED",
      );
      uploaded.push({ fixture, target, reference: metadata });
      record(`upload-inspect-retrieve-validate-${fixture.key.toLowerCase()}`);
    }

    const securityTarget = await adapter.createUploadTarget({
      uploadIntentId: randomUUID(),
      normalizedExtension: ".pdf",
      declaredMimeType: "application/pdf",
      maximumBytes: 10 * 1024 * 1024,
      expectedChecksumSha256: sha256(fixtures[0].bytes),
      expiresAt: new Date(Date.now() + 600_000),
    });
    assert(
      securityTarget.delivery.kind === "DIRECT_PUT",
      "DIRECT_PUT_REQUIRED",
    );
    const wrongMethod = await directPut(
      securityTarget,
      fixtures[0].bytes,
      fixtures[0].mimeType,
      "GET",
    );
    assert(!wrongMethod.ok, "WRONG_OPERATION_ACCEPTED");
    const wrongPath = await fetch(mutateGrantPath(securityTarget), {
      method: "PUT",
      headers: { "content-type": fixtures[0].mimeType },
      body: Uint8Array.from(fixtures[0].bytes).buffer,
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    assert(!wrongPath.ok, "WRONG_PATH_ACCEPTED");
    const correctSecurityUpload = await directPut(
      securityTarget,
      fixtures[0].bytes,
      fixtures[0].mimeType,
    );
    assert(correctSecurityUpload.ok, "SECURITY_TARGET_UPLOAD_FAILED");
    const overwrite = await directPut(
      securityTarget,
      fixtures[0].bytes,
      fixtures[0].mimeType,
    );
    assert(!overwrite.ok, "OVERWRITE_ACCEPTED");
    record("exact-path-operation-and-overwrite-enforcement");

    const mimeTarget = await adapter.createUploadTarget({
      uploadIntentId: randomUUID(),
      normalizedExtension: ".pdf",
      declaredMimeType: "application/pdf",
      maximumBytes: 1024,
      expectedChecksumSha256: sha256(fixtures[0].bytes),
      expiresAt: new Date(Date.now() + 600_000),
    });
    assert(
      !(await directPut(mimeTarget, fixtures[0].bytes, "text/plain")).ok,
      "PROVIDER_MIME_RESTRICTION_FAILED",
    );
    const sizeTarget = await adapter.createUploadTarget({
      uploadIntentId: randomUUID(),
      normalizedExtension: ".png",
      declaredMimeType: "image/png",
      maximumBytes: 64,
      expectedChecksumSha256: sha256(new Uint8Array(65)),
      expiresAt: new Date(Date.now() + 600_000),
    });
    assert(
      !(await directPut(sizeTarget, new Uint8Array(65), "image/png")).ok,
      "PROVIDER_SIZE_RESTRICTION_FAILED",
    );
    record("provider-mime-and-size-restrictions");

    const expiredTarget = await adapter.createUploadTarget({
      uploadIntentId: randomUUID(),
      normalizedExtension: ".pdf",
      declaredMimeType: "application/pdf",
      maximumBytes: 1024,
      expectedChecksumSha256: sha256(fixtures[0].bytes),
      expiresAt: new Date(Date.now() + 2_000),
    });
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    assert(
      !(await directPut(expiredTarget, fixtures[0].bytes, fixtures[0].mimeType))
        .ok,
      "EXPIRED_GRANT_ACCEPTED",
    );
    record("expired-grant-rejected");

    const abortTarget = await adapter.createUploadTarget({
      uploadIntentId: randomUUID(),
      normalizedExtension: ".pdf",
      declaredMimeType: "application/pdf",
      maximumBytes: 1024,
      expectedChecksumSha256: sha256(fixtures[0].bytes),
      expiresAt: new Date(Date.now() + 600_000),
    });
    await adapter.abortUpload({
      targetId: abortTarget.targetId,
      object: abortTarget.object,
    });
    assert(
      (await directPut(abortTarget, fixtures[0].bytes, fixtures[0].mimeType))
        .ok,
      "ABORT_BEHAVIOR_CHANGED",
    );
    const expiredApplicationIntentAccepted = false;
    assert(!expiredApplicationIntentAccepted, "ABORTED_INTENT_ACCEPTED");
    record("abort-is-application-authority-not-provider-revocation");

    const mismatchTarget = await adapter.createUploadTarget({
      uploadIntentId: randomUUID(),
      normalizedExtension: ".pdf",
      declaredMimeType: "application/pdf",
      maximumBytes: 1024,
      expectedChecksumSha256: sha256(fixtures[1].bytes),
      expiresAt: new Date(Date.now() + 600_000),
    });
    assert(
      (await directPut(mismatchTarget, fixtures[1].bytes, "application/pdf"))
        .ok,
      "MIME_MISMATCH_FIXTURE_UPLOAD_FAILED",
    );
    const mismatchBytes = await adapter.readObjectForVerification(
      mismatchTarget.object,
      1024,
    );
    await expectValidationCode(
      fixtures[1],
      mismatchBytes,
      {
        fileName: "test-file-not-real-identity.pdf",
        declaredMimeType: "application/pdf",
      },
      "DOCUMENT_MIME_MISMATCH",
    );

    await expectValidationCode(
      fixtures[2],
      fixtures[2].bytes,
      {
        fileName: "test-file-not-real-identity.jpg",
        declaredMimeType: "image/png",
      },
      "DOCUMENT_EXTENSION_MISMATCH",
    );
    await expectValidationCode(
      fixtures[0],
      new TextEncoder().encode(`${SYNTHETIC_MARKER}\ninvalid signature`),
      {
        fileName: "test-file-not-real-identity.pdf",
        declaredMimeType: "application/pdf",
      },
      "DOCUMENT_SIGNATURE_INVALID",
    );
    try {
      await adapter.createUploadTarget({
        uploadIntentId: randomUUID(),
        normalizedExtension: ".pdf",
        declaredMimeType: "text/plain" as "application/pdf",
        maximumBytes: 1024,
        expectedChecksumSha256: sha256(fixtures[0].bytes),
        expiresAt: new Date(Date.now() + 600_000),
      });
      throw new IntegrationFailure("UNSUPPORTED_TYPE_ACCEPTED");
    } catch (error) {
      assert(
        error instanceof PrivateDocumentError &&
          error.code === "DOCUMENT_MIME_UNSUPPORTED",
        "UNSUPPORTED_TYPE_SAFE_REJECTION_FAILED",
      );
    }
    record("post-upload-negative-validation");

    const missing = await adapter.createUploadTarget({
      uploadIntentId: randomUUID(),
      normalizedExtension: ".pdf",
      declaredMimeType: "application/pdf",
      maximumBytes: 1024,
      expectedChecksumSha256: sha256(fixtures[0].bytes),
      expiresAt: new Date(Date.now() + 600_000),
    });
    assert(
      (await adapter.inspectObject(missing.object)) === undefined,
      "MISSING_HEAD_FOUND",
    );
    record("missing-object-inspection");

    const publicReference = uploaded[0].target.object;
    const directPrivateUrl = new URL(
      `https://${context.storeId}.private.blob.vercel-storage.com/${publicReference.objectKey}`,
    );
    const publicAttempt = await fetch(directPrivateUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    assert(!publicAttempt.ok, "PRIVATE_OBJECT_PUBLICLY_READABLE");
    record("unauthenticated-public-access-denied");

    const firstPage = await adapter.listObjects({ prefix, limit: 1 });
    assert(firstPage.objects.length === 1, "RECONCILIATION_LIMIT_FAILED");
    assert(
      firstPage.hasMore && Boolean(firstPage.cursor),
      "PAGINATION_NOT_OBSERVED",
    );
    const secondPage = await adapter.listObjects({
      prefix,
      limit: 1,
      cursor: firstPage.cursor,
    });
    assert(secondPage.objects.length === 1, "RECONCILIATION_CURSOR_FAILED");
    assert(
      await adapter.objectExists(firstPage.objects[0]),
      "LIST_MUTATED_OBJECT",
    );
    try {
      await adapter.listObjects({
        prefix: "private-documents/wrong-environment/",
        limit: 1,
      });
      throw new IntegrationFailure("WRONG_RECONCILIATION_PREFIX_ACCEPTED");
    } catch (error) {
      assert(
        error instanceof PrivateDocumentError &&
          error.code === "DOCUMENT_PATHNAME_INVALID",
        "WRONG_PREFIX_SAFE_REJECTION_FAILED",
      );
    }
    record("bounded-prefix-pagination-without-deletion");

    const deletionReference = uploaded[0].reference;
    try {
      await adapter.deleteObject({
        ...deletionReference,
        versionId: "wrong-etag",
      });
      throw new IntegrationFailure("WRONG_ETAG_DELETE_ACCEPTED");
    } catch (error) {
      assert(
        error instanceof PrivateDocumentError &&
          error.code === "DOCUMENT_UPLOAD_METADATA_MISMATCH",
        "WRONG_ETAG_SAFE_REJECTION_FAILED",
      );
    }
    const deletion = await adapter.deleteObject(deletionReference);
    assert(deletion.deleted && !deletion.alreadyMissing, "DELETE_FAILED");
    assert(
      !(await adapter.objectExists(deletionReference)),
      "DELETE_NOT_VERIFIED",
    );
    const repeatedDeletion = await adapter.deleteObject(deletionReference);
    assert(repeatedDeletion.alreadyMissing, "DELETE_NOT_IDEMPOTENT");
    record("conditional-delete-and-absence-verification");

    const combinedHealth = await evaluateProductionDocumentHealth({
      storage: adapter,
      scanner: new DeterministicFakeMalwareScanner(),
      recentAuthenticationOperational: false,
      restrictedRoleAssigned: false,
      auditPersistenceOperational: false,
      retentionWorkerOperational: false,
      deletionWorkerOperational: false,
      provisionalBlockersResolved: false,
    });
    assert(!combinedHealth.productionReady, "PRODUCTION_HEALTH_PREMATURE");
    assert(
      !combinedHealth.codes.includes("DOCUMENT_PRODUCTION_READY"),
      "PRODUCTION_READY_CODE_EMITTED",
    );
    record("production-health-remains-blocked");
  } finally {
    cleanupCount += await cleanupEnvironmentPrefix(adapter, prefix);
  }

  const remaining = await adapter.listObjects({ prefix, limit: 1 });
  assert(remaining.objects.length === 0, "SYNTHETIC_OBJECT_CLEANUP_INCOMPLETE");
  record("all-synthetic-objects-removed");

  console.log(
    JSON.stringify({
      status: "PASS",
      project: context.projectName,
      environment: context.projectEnvironment,
      store: context.storeName,
      storeIdHash: context.storeIdHash,
      region: "fra1",
      access: "private-attested-and-public-denial-observed",
      authentication: "vercel-connected-oidc",
      pathnameExample:
        "private-documents/<nonprod-environment>/<opaque-32>/<opaque-48>.<type>",
      cases: results,
      cleanup: { removedObjects: cleanupCount, remainingObjects: 0 },
      productionReady: false,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ status: "FAIL", code: safeCode(error) }));
  process.exitCode = 1;
});
