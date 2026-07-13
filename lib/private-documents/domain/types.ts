import type { Capability } from "@/lib/authorization/capabilities";

export const DOCUMENT_FILE_POLICY = {
  version: 1,
  maximumBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
  allowedExtensions: [".pdf", ".jpg", ".jpeg", ".png"],
} as const;

export type ScanOutcome =
  | "CLEAN"
  | "INFECTED"
  | "ERROR"
  | "TIMEOUT"
  | "UNSUPPORTED"
  | "PASSWORD_PROTECTED";
export type DocumentSideValue = "SINGLE" | "FRONT" | "BACK";
export type AccessPurpose = "VIEW" | "DOWNLOAD";

export interface PrivateObjectReference {
  providerKey: string;
  region: string;
  containerId: string;
  objectKey: string;
  versionId?: string;
  namespace: "quarantine" | "approved";
}

export interface PrivateObjectMetadata extends PrivateObjectReference {
  sizeBytes: number;
  checksumSha256: string;
  updatedAt: Date;
}

export interface UploadTarget {
  targetId: string;
  object: PrivateObjectReference;
  expiresAt: Date;
  maximumBytes: number;
  expectedChecksumSha256: string;
}

export interface ShortLivedAccessGrant {
  documentId: string;
  requesterId: string;
  purpose: AccessPurpose;
  accessValue: string;
  expiresAt: Date;
  oneTime: boolean;
}

export interface DocumentActor {
  userId: string;
  role?: string;
  capabilities: ReadonlySet<Capability>;
  assignedRoleKeys?: ReadonlySet<string>;
}

export interface SafeAuditInput {
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId: string;
  configurationReleaseId?: string;
  customerDocumentId?: string;
  correlationId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface BatchResult {
  examined: number;
  succeeded: number;
  failed: number;
  nextCursor?: string;
  issues: Array<{ id: string; code: string }>;
}
