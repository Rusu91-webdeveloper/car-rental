import { randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readdir,
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
type LocalStorageState = {
  targets: Map<string, TargetState>;
  grants: Map<string, GrantState>;
};
const stateByRoot = new Map<string, LocalStorageState>();
const OPAQUE_KEY = /^[a-f0-9]{48}$/;

/** Local private storage is for disposable development and automated tests only. */
export class LocalPrivateDocumentStorage implements PrivateDocumentStorage {
  readonly providerKey = "local-private";
  private readonly root: string;
  private readonly targets: Map<string, TargetState>;
  private readonly grants: Map<string, GrantState>;
  constructor(
    rootDirectory: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "Local private storage is for disposable development and automated tests only.",
      );
    this.root = resolve(rootDirectory);
    const state = stateByRoot.get(this.root) ?? {
      targets: new Map<string, TargetState>(),
      grants: new Map<string, GrantState>(),
    };
    stateByRoot.set(this.root, state);
    this.targets = state.targets;
    this.grants = state.grants;
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
    uploadIntentId: string;
    normalizedExtension: ".pdf" | ".jpg" | ".jpeg" | ".png";
    declaredMimeType: "application/pdf" | "image/jpeg" | "image/png";
    maximumBytes: number;
    expectedChecksumSha256: string;
    expiresAt: Date;
    existing?: { targetId: string; object: PrivateObjectReference };
  }) {
    await this.initialize();
    if (input.expiresAt <= this.now())
      documentError(
        "DOCUMENT_SESSION_EXPIRED",
        "Upload target already expired.",
      );
    if (input.existing) {
      const state = this.targets.get(input.existing.targetId);
      if (state) {
        if (
          state.target.object.objectKey !== input.existing.object.objectKey ||
          state.target.expectedChecksumSha256 !== input.expectedChecksumSha256
        )
          documentError(
            "DOCUMENT_IDEMPOTENCY_CONFLICT",
            "Existing local upload target is inconsistent.",
          );
        return state.target;
      }
      if (
        input.existing.object.providerKey !== this.providerKey ||
        input.existing.object.containerId !== "disposable-private-documents" ||
        input.existing.object.namespace !== "quarantine" ||
        !OPAQUE_KEY.test(input.existing.object.objectKey)
      )
        documentError(
          "DOCUMENT_IDEMPOTENCY_CONFLICT",
          "Existing local upload target is inconsistent.",
        );
      const restored: UploadTarget = {
        targetId: input.existing.targetId,
        object: input.existing.object,
        expiresAt: input.expiresAt,
        maximumBytes: input.maximumBytes,
        expectedChecksumSha256: input.expectedChecksumSha256,
        delivery: { kind: "LOCAL_STAGED" },
      };
      this.targets.set(restored.targetId, { target: restored, completed: false });
      return restored;
    }
    const target: UploadTarget = {
      targetId: randomUUID(),
      object: {
        providerKey: this.providerKey,
        region: "local-test",
        containerId: "disposable-private-documents",
        objectKey: randomBytes(24).toString("hex"),
        namespace: "quarantine",
      },
      expiresAt: input.expiresAt,
      maximumBytes: input.maximumBytes,
      expectedChecksumSha256: input.expectedChecksumSha256,
      delivery: { kind: "LOCAL_STAGED" },
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
  async openPrivateRead(reference: PrivateObjectReference) {
    const bytes = await this.readObjectForVerification(
      reference,
      Number.MAX_SAFE_INTEGER,
    );
    return {
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      metadata: (await this.inspectObject(reference))!,
    };
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
  async abortUpload(input: {
    targetId: string;
    object: PrivateObjectReference;
  }) {
    const state = this.targets.get(input.targetId);
    if (!state) return;
    await rm(this.pathFor(state.target.object), { force: true });
    this.targets.delete(input.targetId);
  }
  async cleanupAbandonedUpload(input: {
    targetId: string;
    object: PrivateObjectReference;
  }) {
    const existed = this.targets.has(input.targetId);
    await this.abortUpload(input);
    return existed;
  }
  async listObjects(input: { prefix: string; limit: number; cursor?: string }) {
    await this.initialize();
    if (input.limit < 1 || input.limit > 100)
      documentError("DOCUMENT_INTENT_MISMATCH", "List limit is invalid.");
    if (input.prefix && !OPAQUE_KEY.test(input.prefix))
      documentError("DOCUMENT_FILENAME_UNSAFE", "Local prefix is invalid.");
    const names = (await readdir(resolve(this.root, "quarantine")))
      .filter((name) => OPAQUE_KEY.test(name) && name.startsWith(input.prefix))
      .sort();
    const start = input.cursor
      ? Math.max(
          0,
          names.findIndex((name) => name > input.cursor!),
        )
      : 0;
    const selected = names.slice(start, start + input.limit);
    const inspected = await Promise.all(
      selected.map((objectKey) =>
        this.inspectObject({
          providerKey: this.providerKey,
          region: "local-test",
          containerId: "disposable-private-documents",
          objectKey,
          namespace: "quarantine",
        }),
      ),
    );
    const objects: PrivateObjectMetadata[] = [];
    for (const value of inspected) if (value) objects.push(value);
    return {
      objects,
      cursor:
        start + selected.length < names.length ? selected.at(-1) : undefined,
      hasMore: start + selected.length < names.length,
    };
  }
  async dispose() {
    this.targets.clear();
    this.grants.clear();
    stateByRoot.delete(this.root);
    await rm(this.root, { recursive: true, force: true });
  }
}
