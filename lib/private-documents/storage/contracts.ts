import type {
  PrivateObjectMetadata,
  PrivateObjectListPage,
  PrivateObjectRead,
  PrivateObjectReference,
  ShortLivedAccessGrant,
  UploadTarget,
} from "../domain/types";

export interface StorageHealth {
  configured: boolean;
  privateAccess: boolean;
  productionReady: boolean;
  providerKey: string;
  region: string;
  issues: string[];
}
export interface PrivateDocumentStorage {
  readonly providerKey: string;
  verifyProviderConfiguration(): Promise<StorageHealth>;
  createUploadTarget(input: {
    uploadIntentId: string;
    normalizedExtension: ".pdf" | ".jpg" | ".jpeg" | ".png";
    declaredMimeType: "application/pdf" | "image/jpeg" | "image/png";
    maximumBytes: number;
    expectedChecksumSha256: string;
    expiresAt: Date;
    existing?: { targetId: string; object: PrivateObjectReference };
  }): Promise<UploadTarget>;
  completeStagedUpload(
    targetId: string,
    bytes: Uint8Array,
  ): Promise<PrivateObjectMetadata>;
  inspectObject(
    reference: PrivateObjectReference,
  ): Promise<PrivateObjectMetadata | undefined>;
  readObjectForVerification(
    reference: PrivateObjectReference,
    maximumBytes: number,
  ): Promise<Uint8Array>;
  openPrivateRead(
    reference: PrivateObjectReference,
  ): Promise<PrivateObjectRead>;
  createShortLivedReadAccess(
    reference: PrivateObjectReference,
    input: {
      documentId: string;
      requesterId: string;
      purpose: "VIEW" | "DOWNLOAD";
      expiresAt: Date;
      oneTime: boolean;
    },
  ): Promise<ShortLivedAccessGrant>;
  markQuarantined(
    reference: PrivateObjectReference,
  ): Promise<PrivateObjectReference>;
  markApproved(
    reference: PrivateObjectReference,
  ): Promise<PrivateObjectReference>;
  deleteObject(reference: PrivateObjectReference): Promise<{
    deleted: boolean;
    alreadyMissing: boolean;
    confirmationReference: string;
  }>;
  objectExists(reference: PrivateObjectReference): Promise<boolean>;
  abortUpload(input: {
    targetId: string;
    object: PrivateObjectReference;
  }): Promise<void>;
  cleanupAbandonedUpload(input: {
    targetId: string;
    object: PrivateObjectReference;
  }): Promise<boolean>;
  listObjects(input: {
    prefix: string;
    limit: number;
    cursor?: string;
  }): Promise<PrivateObjectListPage>;
}
