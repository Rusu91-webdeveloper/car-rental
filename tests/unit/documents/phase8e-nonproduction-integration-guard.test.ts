import { describe, expect, it } from "vitest";
import { validateDocumentFile } from "@/lib/private-documents/application/file-validation";
import {
  DocumentIntegrationGuardError,
  requireNonProductionIntegrationEnvironment,
} from "@/lib/private-documents/infrastructure/nonproduction-integration";
import {
  SYNTHETIC_MARKER,
  syntheticDocumentFixtures,
} from "@/scripts/private-documents/synthetic-fixtures";

const now = new Date("2026-07-13T12:00:00.000Z");

function token(overrides: Record<string, unknown> = {}) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    project: "car-rental-documents-nonprod",
    project_id: "prj_nonproduction_fixture",
    environment: "development",
    exp: Math.floor(now.getTime() / 1000) + 3600,
    ...overrides,
  })}.test-signature`;
}

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "test",
    VERCEL_ENV: "development",
    VERCEL_OIDC_TOKEN: token(),
    BLOB_STORE_ID: "store_nonproduction_fixture",
    PRIVATE_DOCUMENT_INTEGRATION_ENABLED: "true",
    PRIVATE_DOCUMENT_INTEGRATION_SYNTHETIC_ONLY: "true",
    PRIVATE_DOCUMENT_INTEGRATION_EXPECTED_PROJECT:
      "car-rental-documents-nonprod",
    PRIVATE_DOCUMENT_INTEGRATION_STORE_NAME: "car-rental-documents-nonprod",
    PRIVATE_DOCUMENT_STORAGE_PROVIDER: "vercel-blob-private",
    PRIVATE_DOCUMENT_BLOB_STORE_ID: "store_nonproduction_fixture",
    PRIVATE_DOCUMENT_BLOB_REGION: "fra1",
    PRIVATE_DOCUMENT_BLOB_PRIVATE_ACCESS_ATTESTED: "true",
    PRIVATE_DOCUMENT_BLOB_REGION_ATTESTED: "true",
    PRIVATE_DOCUMENT_ENVIRONMENT: "phase8ec-nonprod",
    ...overrides,
  };
}

function code(error: unknown) {
  return error instanceof DocumentIntegrationGuardError
    ? error.code
    : undefined;
}

describe("Phase 8E-C non-production integration guard", () => {
  it("accepts only explicit synthetic development OIDC context", () => {
    expect(
      requireNonProductionIntegrationEnvironment(environment(), now),
    ).toMatchObject({
      projectName: "car-rental-documents-nonprod",
      projectEnvironment: "development",
      storeName: "car-rental-documents-nonprod",
      environmentId: "phase8ec-nonprod",
    });
  });

  it.each([
    [
      { PRIVATE_DOCUMENT_INTEGRATION_ENABLED: undefined },
      "DOCUMENT_INTEGRATION_EXPLICIT_ENABLE_REQUIRED",
    ],
    [{ NODE_ENV: "production" }, "DOCUMENT_INTEGRATION_PRODUCTION_REJECTED"],
    [{ VERCEL_ENV: "production" }, "DOCUMENT_INTEGRATION_PRODUCTION_REJECTED"],
    [
      { BLOB_READ_WRITE_TOKEN: "forbidden" },
      "DOCUMENT_INTEGRATION_STATIC_TOKEN_REJECTED",
    ],
    [{ VERCEL_OIDC_TOKEN: undefined }, "DOCUMENT_INTEGRATION_OIDC_REQUIRED"],
    [
      { PRIVATE_DOCUMENT_BLOB_REGION: "iad1" },
      "DOCUMENT_INTEGRATION_REGION_MISMATCH",
    ],
    [{ BLOB_STORE_ID: "wrong-store" }, "DOCUMENT_INTEGRATION_STORE_MISMATCH"],
    [
      { VERCEL_OIDC_TOKEN: token({ project: "production-project" }) },
      "DOCUMENT_INTEGRATION_OIDC_PROJECT_MISMATCH",
    ],
    [
      { VERCEL_OIDC_TOKEN: token({ environment: "production" }) },
      "DOCUMENT_INTEGRATION_OIDC_ENVIRONMENT_REJECTED",
    ],
  ] as const)("fails closed for %o", (override, expectedCode) => {
    try {
      requireNonProductionIntegrationEnvironment(
        environment({ ...override }),
        now,
      );
      throw new Error("expected guard failure");
    } catch (error) {
      expect(code(error)).toBe(expectedCode);
    }
  });
});

describe("Phase 8E-C synthetic-only fixtures", () => {
  it("contains the explicit non-identity marker in every fixture", () => {
    for (const fixture of syntheticDocumentFixtures())
      expect(
        Buffer.from(fixture.bytes).includes(Buffer.from(SYNTHETIC_MARKER)),
      ).toBe(true);
  });

  it("passes the Phase 8D validator for PDF, JPEG, and PNG", () => {
    expect(
      syntheticDocumentFixtures().map(
        (fixture) =>
          validateDocumentFile({
            originalFileName: fixture.fileName,
            declaredMimeType: fixture.mimeType,
            bytes: fixture.bytes,
          }).detectedFileType,
      ),
    ).toEqual(["PDF", "JPEG", "PNG"]);
  });
});
