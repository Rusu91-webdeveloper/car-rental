import type {
  PrivateObjectMetadata,
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
    maximumBytes: number;
    expectedChecksumSha256: string;
    expiresAt: Date;
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
  abortUpload(targetId: string): Promise<void>;
  cleanupAbandonedUpload(targetId: string): Promise<boolean>;
}
