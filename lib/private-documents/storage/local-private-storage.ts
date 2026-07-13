import { randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { resolve, sep } from "node:path";
import { sha256 } from "../application/file-validation";
import { documentError } from "../domain/errors";
import type {
  PrivateObjectMetadata,
  PrivateObjectReference,
  ShortLivedAccessGrant,
  UploadTarget,
} from "../domain/types";
import type { PrivateDocumentStorage, StorageHealth } from "./contracts";

type TargetState = { target: UploadTarget; completed: boolean };
type GrantState = {
  reference: PrivateObjectReference;
  grant: ShortLivedAccessGrant;
  redeemed: boolean;
};
const OPAQUE_KEY = /^[a-f0-9]{48}$/;

/** Local private storage is for disposable development and automated tests only. */
export class LocalPrivateDocumentStorage implements PrivateDocumentStorage {
  readonly providerKey = "local-private";
  private readonly root: string;
  private targets = new Map<string, TargetState>();
  private grants = new Map<string, GrantState>();
  constructor(
    rootDirectory: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "Local private storage is for disposable development and automated tests only.",
      );
    this.root = resolve(rootDirectory);
    const publicRoot = resolve(process.cwd(), "public");
    if (this.root === publicRoot || this.root.startsWith(`${publicRoot}${sep}`))
      throw new Error("Local private storage cannot use public/.");
  }
  private async initialize() {
    await mkdir(resolve(this.root, "quarantine"), {
      recursive: true,
      mode: 0o700,
    });
    await mkdir(resolve(this.root, "approved"), {
      recursive: true,
      mode: 0o700,
    });
    await chmod(this.root, 0o700).catch(() => undefined);
  }
  private pathFor(reference: PrivateObjectReference) {
    if (
      reference.providerKey !== this.providerKey ||
      reference.containerId !== "disposable-private-documents" ||
      !OPAQUE_KEY.test(reference.objectKey) ||
      !["quarantine", "approved"].includes(reference.namespace)
    )
      documentError(
        "DOCUMENT_UPLOAD_METADATA_MISMATCH",
        "Invalid local object reference.",
      );
    const root = resolve(this.root, reference.namespace);
    const candidate = resolve(root, reference.objectKey);
    if (!candidate.startsWith(`${root}${sep}`))
      documentError("DOCUMENT_FILENAME_UNSAFE", "Path traversal was rejected.");
    return candidate;
  }
  async verifyProviderConfiguration(): Promise<StorageHealth> {
    await this.initialize();
    return {
      configured: true,
      privateAccess: true,
      productionReady: false,
      providerKey: this.providerKey,
      region: "local-test",
      issues: ["DOCUMENT_LOCAL_ADAPTER_ONLY"],
    };
  }
  async createUploadTarget(input: {
    maximumBytes: number;
    expectedChecksumSha256: string;
    expiresAt: Date;
  }) {
    await this.initialize();
    if (input.expiresAt <= this.now())
      documentError(
        "DOCUMENT_SESSION_EXPIRED",
        "Upload target already expired.",
      );
    const target: UploadTarget = {
      targetId: randomUUID(),
      object: {
        providerKey: this.providerKey,
        region: "local-test",
        containerId: "disposable-private-documents",
        objectKey: randomBytes(24).toString("hex"),
        namespace: "quarantine",
      },
      ...input,
    };
    this.targets.set(target.targetId, { target, completed: false });
    return target;
  }
  async completeStagedUpload(
    targetId: string,
    bytes: Uint8Array,
  ): Promise<PrivateObjectMetadata> {
    const state = this.targets.get(targetId);
    if (!state)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Upload target not found.");
    if (state.target.expiresAt <= this.now())
      documentError("DOCUMENT_SESSION_EXPIRED", "Upload target expired.");
    const checksum = sha256(bytes);
    if (
      !bytes.length ||
      bytes.length > state.target.maximumBytes ||
      checksum !== state.target.expectedChecksumSha256
    )
      documentError(
        "DOCUMENT_UPLOAD_METADATA_MISMATCH",
        "Bytes do not match target contract.",
      );
    if (state.completed) {
      const existing = await this.inspectObject(state.target.object);
      if (
        existing?.checksumSha256 === checksum &&
        existing.sizeBytes === bytes.length
      )
        return existing;
      documentError(
        "DOCUMENT_IDEMPOTENCY_CONFLICT",
        "Target completed with different bytes.",
      );
    }
    const path = this.pathFor(state.target.object);
    await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    await chmod(path, 0o600).catch(() => undefined);
    state.completed = true;
    return (await this.inspectObject(state.target.object))!;
  }
  async inspectObject(reference: PrivateObjectReference) {
    try {
      const path = this.pathFor(reference);
      const [details, bytes] = await Promise.all([stat(path), readFile(path)]);
      if (!details.isFile()) return undefined;
      return {
        ...reference,
        sizeBytes: details.size,
        checksumSha256: sha256(bytes),
        updatedAt: details.mtime,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  async readObjectForVerification(
    reference: PrivateObjectReference,
    maximumBytes: number,
  ) {
    const metadata = await this.inspectObject(reference);
    if (!metadata)
      documentError("DOCUMENT_UPLOAD_NOT_FOUND", "Object not found.");
    if (metadata.sizeBytes > maximumBytes)
      documentError("DOCUMENT_FILE_TOO_LARGE", "Object exceeds read limit.");
    return new Uint8Array(await readFile(this.pathFor(reference)));
  }
  async markQuarantined(reference: PrivateObjectReference) {
    if (
      reference.namespace !== "quarantine" ||
      !(await this.objectExists(reference))
    )
      documentError("DOCUMENT_INTENT_MISMATCH", "Object is not quarantined.");
    return reference;
  }
  async markApproved(reference: PrivateObjectReference) {
    if (reference.namespace === "approved") return reference;
    const approved = { ...reference, namespace: "approved" as const };
    await rename(this.pathFor(reference), this.pathFor(approved));
    return approved;
  }
  async createShortLivedReadAccess(
    reference: PrivateObjectReference,
    input: {
      documentId: string;
      requesterId: string;
      purpose: "VIEW" | "DOWNLOAD";
      expiresAt: Date;
      oneTime: boolean;
    },
  ) {
    if (
      reference.namespace !== "approved" ||
      !(await this.objectExists(reference))
    )
      documentError("DOCUMENT_SCAN_NOT_CLEAN", "Object is not approved.");
    if (input.expiresAt <= this.now())
      documentError("DOCUMENT_ACCESS_DENIED", "Access expiry is invalid.");
    const token = randomBytes(32).toString("base64url");
    const grant = { ...input, accessValue: token };
    this.grants.set(token, { reference, grant, redeemed: false });
    return grant;
  }
  async redeemLocalAccess(accessValue: string) {
    const state = this.grants.get(accessValue);
    if (
      !state ||
      state.grant.expiresAt <= this.now() ||
      (state.grant.oneTime && state.redeemed)
    )
      documentError("DOCUMENT_ACCESS_DENIED", "Grant invalid or expired.");
    state.redeemed = true;
    return new Uint8Array(await readFile(this.pathFor(state.reference)));
  }
  async deleteObject(reference: PrivateObjectReference) {
    const existed = await this.objectExists(reference);
    await rm(this.pathFor(reference), { force: true });
    return {
      deleted: existed,
      alreadyMissing: !existed,
      confirmationReference: `local-delete-${randomUUID()}`,
    };
  }
  async objectExists(reference: PrivateObjectReference) {
    return Boolean(await this.inspectObject(reference));
  }
  async abortUpload(targetId: string) {
    const state = this.targets.get(targetId);
    if (!state) return;
    await rm(this.pathFor(state.target.object), { force: true });
    this.targets.delete(targetId);
  }
  async cleanupAbandonedUpload(targetId: string) {
    const existed = this.targets.has(targetId);
    await this.abortUpload(targetId);
    return existed;
  }
  async dispose() {
    this.targets.clear();
    this.grants.clear();
    await rm(this.root, { recursive: true, force: true });
  }
}
