import { createHash } from "node:crypto";

type Environment = Readonly<Record<string, string | undefined>>;

export class DocumentIntegrationGuardError extends Error {
  constructor(readonly code: string) {
    super("Non-production document integration guard rejected execution.");
    this.name = "DocumentIntegrationGuardError";
  }
}

interface VercelOidcClaims {
  project?: unknown;
  project_id?: unknown;
  environment?: unknown;
  exp?: unknown;
}

function reject(code: string): never {
  throw new DocumentIntegrationGuardError(code);
}

function decodeClaims(token: string): VercelOidcClaims {
  const segments = token.split(".");
  if (segments.length !== 3) reject("DOCUMENT_INTEGRATION_OIDC_MALFORMED");
  try {
    const json = Buffer.from(segments[1], "base64url").toString("utf8");
    return JSON.parse(json) as VercelOidcClaims;
  } catch {
    reject("DOCUMENT_INTEGRATION_OIDC_MALFORMED");
  }
}

export interface NonProductionIntegrationContext {
  projectName: string;
  projectEnvironment: "development" | "preview";
  storeName: string;
  storeId: string;
  storeIdHash: string;
  environmentId: string;
}

export function requireNonProductionIntegrationEnvironment(
  env: Environment = process.env,
  now: Date = new Date(),
): NonProductionIntegrationContext {
  if (
    env.PRIVATE_DOCUMENT_INTEGRATION_ENABLED !== "true" ||
    env.PRIVATE_DOCUMENT_INTEGRATION_SYNTHETIC_ONLY !== "true"
  )
    reject("DOCUMENT_INTEGRATION_EXPLICIT_ENABLE_REQUIRED");
  if (
    env.NODE_ENV === "production" ||
    env.VERCEL_ENV === "production" ||
    env.PRIVATE_DOCUMENTS_PRODUCTION_ENABLED === "true"
  )
    reject("DOCUMENT_INTEGRATION_PRODUCTION_REJECTED");
  if (env.PRIVATE_DOCUMENT_STORAGE_PROVIDER !== "vercel-blob-private")
    reject("DOCUMENT_INTEGRATION_PROVIDER_MISMATCH");
  if (env.BLOB_READ_WRITE_TOKEN)
    reject("DOCUMENT_INTEGRATION_STATIC_TOKEN_REJECTED");
  if (!env.VERCEL_OIDC_TOKEN) reject("DOCUMENT_INTEGRATION_OIDC_REQUIRED");
  if (
    !env.PRIVATE_DOCUMENT_INTEGRATION_EXPECTED_PROJECT ||
    !env.PRIVATE_DOCUMENT_INTEGRATION_EXPECTED_PROJECT.includes("nonprod")
  )
    reject("DOCUMENT_INTEGRATION_PROJECT_INVALID");
  if (
    !env.PRIVATE_DOCUMENT_INTEGRATION_STORE_NAME ||
    !env.PRIVATE_DOCUMENT_INTEGRATION_STORE_NAME.includes("nonprod")
  )
    reject("DOCUMENT_INTEGRATION_STORE_INVALID");
  if (
    !env.PRIVATE_DOCUMENT_BLOB_STORE_ID ||
    env.PRIVATE_DOCUMENT_BLOB_STORE_ID !== env.BLOB_STORE_ID
  )
    reject("DOCUMENT_INTEGRATION_STORE_MISMATCH");
  if (env.PRIVATE_DOCUMENT_BLOB_REGION !== "fra1")
    reject("DOCUMENT_INTEGRATION_REGION_MISMATCH");
  if (
    env.PRIVATE_DOCUMENT_BLOB_PRIVATE_ACCESS_ATTESTED !== "true" ||
    env.PRIVATE_DOCUMENT_BLOB_REGION_ATTESTED !== "true"
  )
    reject("DOCUMENT_INTEGRATION_ATTESTATION_REQUIRED");
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(env.PRIVATE_DOCUMENT_ENVIRONMENT ?? ""))
    reject("DOCUMENT_INTEGRATION_ENVIRONMENT_INVALID");

  const claims = decodeClaims(env.VERCEL_OIDC_TOKEN);
  if (
    claims.project !== env.PRIVATE_DOCUMENT_INTEGRATION_EXPECTED_PROJECT ||
    typeof claims.project_id !== "string" ||
    !claims.project_id.startsWith("prj_")
  )
    reject("DOCUMENT_INTEGRATION_OIDC_PROJECT_MISMATCH");
  if (claims.environment !== "development" && claims.environment !== "preview")
    reject("DOCUMENT_INTEGRATION_OIDC_ENVIRONMENT_REJECTED");
  if (
    typeof claims.exp !== "number" ||
    claims.exp * 1000 <= now.getTime() + 60_000
  )
    reject("DOCUMENT_INTEGRATION_OIDC_EXPIRED");

  return {
    projectName: claims.project,
    projectEnvironment: claims.environment,
    storeName: env.PRIVATE_DOCUMENT_INTEGRATION_STORE_NAME,
    storeId: env.BLOB_STORE_ID as string,
    storeIdHash: createHash("sha256")
      .update(env.BLOB_STORE_ID)
      .digest("hex")
      .slice(0, 12),
    environmentId: env.PRIVATE_DOCUMENT_ENVIRONMENT as string,
  };
}
