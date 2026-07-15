import { describe, expect, it, vi } from "vitest";
import { evaluateProductionDocumentHealth } from "@/lib/private-documents/application/health";
import { PrivateDocumentError } from "@/lib/private-documents/domain/errors";
import { readPrivateDocumentEnvironment } from "@/lib/private-documents/infrastructure/environment";
import type { VercelBlobClient } from "@/lib/private-documents/infrastructure/vercel-blob-client";
import { DeterministicFakeMalwareScanner } from "@/lib/private-documents/scanning/fake-scanner";
import { createPrivateDocumentStorage } from "@/lib/private-documents/storage/factory";
import {
  assertVercelBlobPathname,
  createVercelBlobPathname,
  environmentBlobPrefix,
} from "@/lib/private-documents/storage/vercel-blob-pathname";
import { VercelBlobPrivateStorageAdapter } from "@/lib/private-documents/storage/vercel-blob-private-storage";

const productionEnvironment = () =>
  readPrivateDocumentEnvironment({
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_OIDC_TOKEN: "test-oidc-not-used",
    BLOB_STORE_ID: "store_expected",
    PRIVATE_DOCUMENTS_ENABLED: "true",
    PRIVATE_DOCUMENT_STORAGE_PROVIDER: "vercel-blob-private",
    PRIVATE_DOCUMENT_BLOB_STORE_ID: "store_expected",
    PRIVATE_DOCUMENT_BLOB_REGION: "fra1",
    PRIVATE_DOCUMENT_BLOB_PRIVATE_ACCESS_ATTESTED: "true",
    PRIVATE_DOCUMENT_BLOB_REGION_ATTESTED: "true",
    PRIVATE_DOCUMENT_ENVIRONMENT: "production",
  });

function client(): VercelBlobClient {
  return {
    issueUploadToken: vi.fn(),
    presignPut: vi.fn(),
    head: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    list: vi.fn().mockResolvedValue({ blobs: [], hasMore: false }),
  };
}

describe("Phase 8E-B environment and pathname boundary", () => {
  it("accepts only the approved production provider, store, region, and OIDC mode", () => {
    const environment = productionEnvironment();
    expect(environment.issues).toEqual([]);
    expect(environment.maximumUploadBytes).toBe(10 * 1024 * 1024);
    expect(environment.uploadGrantSeconds).toBe(600);
    expect(environment.recentAuthMaximumAgeSeconds).toBe(600);
    expect(environment).not.toHaveProperty("oidcToken");
  });

  it.each([
    [
      { PRIVATE_DOCUMENT_BLOB_STORE_ID: undefined },
      "DOCUMENT_BLOB_EXPECTED_STORE_MISSING",
    ],
    [{ BLOB_STORE_ID: "wrong" }, "DOCUMENT_BLOB_STORE_MISMATCH"],
    [{ PRIVATE_DOCUMENT_BLOB_REGION: "iad1" }, "DOCUMENT_BLOB_REGION_MISMATCH"],
    [{ VERCEL_OIDC_TOKEN: undefined }, "DOCUMENT_BLOB_OIDC_UNAVAILABLE"],
    [
      { BLOB_READ_WRITE_TOKEN: "forbidden" },
      "DOCUMENT_PRODUCTION_STATIC_TOKEN_UNSUPPORTED",
    ],
  ] as const)("fails closed for %o", (override, issue) => {
    const base: Record<string, string | undefined> = {
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_OIDC_TOKEN: "test-only",
      BLOB_STORE_ID: "store_expected",
      PRIVATE_DOCUMENT_STORAGE_PROVIDER: "vercel-blob-private",
      PRIVATE_DOCUMENT_BLOB_STORE_ID: "store_expected",
      PRIVATE_DOCUMENT_BLOB_REGION: "fra1",
      PRIVATE_DOCUMENT_ENVIRONMENT: "production",
      ...override,
    };
    expect(readPrivateDocumentEnvironment(base).issues).toContain(issue);
  });

  it("rejects the local adapter in production", () => {
    const environment = readPrivateDocumentEnvironment({
      NODE_ENV: "production",
      PRIVATE_DOCUMENT_STORAGE_PROVIDER: "local-private",
      PRIVATE_DOCUMENT_ENVIRONMENT: "production",
    });
    expect(() =>
      createPrivateDocumentStorage({ environment, localRoot: "/tmp/nope" }),
    ).toThrow(PrivateDocumentError);
  });

  it("generates deterministic opaque environment paths without supplied names or PII", () => {
    const first = createVercelBlobPathname({
      environmentId: "production",
      uploadIntentId: "intent_0123456789abcdef",
      normalizedExtension: ".pdf",
    });
    const repeat = createVercelBlobPathname({
      environmentId: "production",
      uploadIntentId: "intent_0123456789abcdef",
      normalizedExtension: ".pdf",
    });
    const other = createVercelBlobPathname({
      environmentId: "production",
      uploadIntentId: "intent_fedcba9876543210",
      normalizedExtension: ".pdf",
    });
    expect(first).toBe(repeat);
    expect(first).not.toBe(other);
    expect(first).not.toContain("passport");
    expect(first).not.toContain("customer");
    expect(first).toMatch(
      /^private-documents\/production\/[a-f0-9]{32}\/[a-f0-9]{48}\.pdf$/,
    );
  });

  it.each([
    "../private-documents/production/a/b.pdf",
    "private-documents\\production\\a.pdf",
    "private-documents//production/a.pdf",
    "private-documents/production/control\u0000/a.pdf",
  ])("rejects unsafe path %s", (pathname) => {
    expect(() => assertVercelBlobPathname(pathname)).toThrow(
      PrivateDocumentError,
    );
  });
});

describe("Phase 8E-B production health", () => {
  it("does not become production-ready with mocked Blob when blockers remain", async () => {
    const adapter = new VercelBlobPrivateStorageAdapter({
      environment: productionEnvironment(),
      client: client(),
    });
    const health = await evaluateProductionDocumentHealth({
      storage: adapter,
      scanner: new DeterministicFakeMalwareScanner(),
      recentAuthenticationOperational: false,
      restrictedRoleAssigned: false,
      auditPersistenceOperational: true,
      retentionWorkerOperational: false,
      deletionWorkerOperational: false,
      provisionalBlockersResolved: false,
    });
    expect(health.productionReady).toBe(false);
    expect(health.codes).toContain(
      "DOCUMENT_PRODUCTION_SCANNER_NOT_CONFIGURED",
    );
    expect(health.codes).toContain("DOCUMENT_RECENT_AUTH_NOT_OPERATIONAL");
    expect(health.codes).toContain("DOCUMENT_RESTRICTED_ROLE_NOT_ASSIGNED");
    expect(health.codes).not.toContain("DOCUMENT_PRODUCTION_READY");
  });

  it("uses only the strict environment reconciliation prefix during health verification", async () => {
    const mock = client();
    const adapter = new VercelBlobPrivateStorageAdapter({
      environment: productionEnvironment(),
      client: mock,
    });
    const health = await adapter.verifyProviderConfiguration();
    expect(health.productionReady).toBe(true);
    expect(mock.list).toHaveBeenCalledWith({
      prefix: environmentBlobPrefix("production"),
      limit: 1,
    });
  });
});
