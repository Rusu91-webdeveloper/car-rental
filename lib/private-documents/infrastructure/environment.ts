import { DOCUMENT_FILE_POLICY } from "../domain/types";

export type PrivateDocumentStorageProvider =
  | "local-private"
  | "vercel-blob-private";

export interface PrivateDocumentEnvironment {
  production: boolean;
  featureEnabled: boolean;
  storageProvider: PrivateDocumentStorageProvider;
  reviewMode: "manual" | "scanner";
  scannerPathEnabled: boolean;
  expectedStoreId?: string;
  actualStoreId?: string;
  expectedRegion: string;
  environmentId: string;
  maximumUploadBytes: number;
  uploadGrantSeconds: number;
  recentAuthMaximumAgeSeconds: number;
  reconciliationBatchSize: number;
  vercelRuntime: boolean;
  oidcAvailable: boolean;
  staticTokenAvailable: boolean;
  privateAccessAttested: boolean;
  regionAttested: boolean;
  issues: string[];
}

type Environment = Readonly<Record<string, string | undefined>>;

function positiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : NaN;
}

export function readPrivateDocumentEnvironment(
  env: Environment = process.env,
): PrivateDocumentEnvironment {
  const production = env.NODE_ENV === "production";
  const provider = env.PRIVATE_DOCUMENT_STORAGE_PROVIDER;
  const storageProvider: PrivateDocumentStorageProvider =
    provider === "vercel-blob-private" ? provider : "local-private";
  const reviewMode =
    env.PRIVATE_DOCUMENT_REVIEW_MODE === "scanner" ? "scanner" : "manual";
  const scannerPathEnabled = env.PRIVATE_DOCUMENT_SCANNER_ENABLED === "true";
  const maximumUploadBytes = positiveInteger(
    env.PRIVATE_DOCUMENT_MAXIMUM_UPLOAD_BYTES,
    DOCUMENT_FILE_POLICY.maximumBytes,
  );
  const uploadGrantSeconds = positiveInteger(
    env.PRIVATE_DOCUMENT_UPLOAD_GRANT_SECONDS,
    600,
  );
  const recentAuthMaximumAgeSeconds = positiveInteger(
    env.PRIVATE_DOCUMENT_RECENT_AUTH_SECONDS,
    600,
  );
  const reconciliationBatchSize = positiveInteger(
    env.PRIVATE_DOCUMENT_RECONCILIATION_BATCH_SIZE,
    50,
  );
  const expectedStoreId = env.PRIVATE_DOCUMENT_BLOB_STORE_ID;
  const actualStoreId = env.BLOB_STORE_ID;
  const expectedRegion = env.PRIVATE_DOCUMENT_BLOB_REGION ?? "fra1";
  const issues: string[] = [];
  if (provider && !["local-private", "vercel-blob-private"].includes(provider))
    issues.push("DOCUMENT_STORAGE_PROVIDER_INVALID");
  if (maximumUploadBytes > DOCUMENT_FILE_POLICY.maximumBytes)
    issues.push("DOCUMENT_UPLOAD_LIMIT_INVALID");
  if (!Number.isFinite(maximumUploadBytes))
    issues.push("DOCUMENT_UPLOAD_LIMIT_INVALID");
  if (!Number.isFinite(uploadGrantSeconds) || uploadGrantSeconds > 600)
    issues.push("DOCUMENT_UPLOAD_GRANT_LIFETIME_INVALID");
  if (
    !Number.isFinite(recentAuthMaximumAgeSeconds) ||
    recentAuthMaximumAgeSeconds > 600
  )
    issues.push("DOCUMENT_RECENT_AUTH_WINDOW_INVALID");
  if (
    !Number.isFinite(reconciliationBatchSize) ||
    reconciliationBatchSize > 100
  )
    issues.push("DOCUMENT_RECONCILIATION_BATCH_INVALID");
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(env.PRIVATE_DOCUMENT_ENVIRONMENT ?? ""))
    issues.push("DOCUMENT_ENVIRONMENT_ID_INVALID");
  if (production && storageProvider !== "vercel-blob-private")
    issues.push("DOCUMENT_PRODUCTION_STORAGE_NOT_CONFIGURED");
  if (production && env.PRIVATE_DOCUMENTS_ENABLED !== "true")
    issues.push("DOCUMENT_PRIVATE_DOCUMENTS_DISABLED");
  if (production && reviewMode !== "manual")
    issues.push("DOCUMENT_MANUAL_REVIEW_NOT_CONFIGURED");
  if (production && scannerPathEnabled)
    issues.push("DOCUMENT_SCANNER_PATH_MUST_BE_DISABLED");
  if (storageProvider === "vercel-blob-private") {
    if (!expectedStoreId) issues.push("DOCUMENT_BLOB_EXPECTED_STORE_MISSING");
    if (!actualStoreId) issues.push("DOCUMENT_BLOB_ACTUAL_STORE_MISSING");
    if (expectedStoreId && actualStoreId && expectedStoreId !== actualStoreId)
      issues.push("DOCUMENT_BLOB_STORE_MISMATCH");
    if (expectedRegion !== "fra1") issues.push("DOCUMENT_BLOB_REGION_MISMATCH");
  }
  if (production && !env.VERCEL)
    issues.push("DOCUMENT_VERCEL_RUNTIME_UNAVAILABLE");
  if (production && !env.VERCEL_OIDC_TOKEN)
    issues.push("DOCUMENT_BLOB_OIDC_UNAVAILABLE");
  if (production && env.BLOB_READ_WRITE_TOKEN)
    issues.push("DOCUMENT_PRODUCTION_STATIC_TOKEN_UNSUPPORTED");
  return {
    production,
    featureEnabled: env.PRIVATE_DOCUMENTS_ENABLED === "true",
    storageProvider,
    reviewMode,
    scannerPathEnabled,
    expectedStoreId,
    actualStoreId,
    expectedRegion,
    environmentId: env.PRIVATE_DOCUMENT_ENVIRONMENT ?? "local",
    maximumUploadBytes,
    uploadGrantSeconds,
    recentAuthMaximumAgeSeconds,
    reconciliationBatchSize,
    vercelRuntime: Boolean(env.VERCEL),
    oidcAvailable: Boolean(env.VERCEL_OIDC_TOKEN),
    staticTokenAvailable: Boolean(env.BLOB_READ_WRITE_TOKEN),
    privateAccessAttested:
      env.PRIVATE_DOCUMENT_BLOB_PRIVATE_ACCESS_ATTESTED === "true",
    regionAttested: env.PRIVATE_DOCUMENT_BLOB_REGION_ATTESTED === "true",
    issues,
  };
}
