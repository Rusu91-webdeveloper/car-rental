import { documentError } from "../domain/errors";
import type { PrivateDocumentEnvironment } from "../infrastructure/environment";
import type { VercelBlobClient } from "../infrastructure/vercel-blob-client";
import type { PrivateDocumentStorage } from "./contracts";
import { LocalPrivateDocumentStorage } from "./local-private-storage";
import { VercelBlobPrivateStorageAdapter } from "./vercel-blob-private-storage";

export function createPrivateDocumentStorage(input: {
  environment: PrivateDocumentEnvironment;
  localRoot?: string;
  vercelClient?: VercelBlobClient;
}): PrivateDocumentStorage {
  if (input.environment.storageProvider === "vercel-blob-private")
    return new VercelBlobPrivateStorageAdapter({
      environment: input.environment,
      client: input.vercelClient,
    });
  if (input.environment.production)
    documentError(
      "DOCUMENT_PROVIDER_STORE_MISMATCH",
      "Local private storage cannot be selected in production.",
    );
  if (!input.localRoot)
    documentError(
      "DOCUMENT_PROVIDER_STORE_UNAVAILABLE",
      "Local private storage root is missing.",
    );
  return new LocalPrivateDocumentStorage(input.localRoot);
}
