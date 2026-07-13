import type { DocumentRecord, SessionRecord } from "./repository";
export type ReadinessCode =
  | "DOCUMENT_READY"
  | "DOCUMENT_MISSING"
  | "DOCUMENT_PENDING_SCAN"
  | "DOCUMENT_REJECTED"
  | "DOCUMENT_EXPIRED"
  | "DOCUMENT_INVALID_PROVENANCE"
  | "DOCUMENT_POLICY_CONFLICT";
export function resolveDocumentReadiness(input: {
  session: SessionRecord;
  documents: DocumentRecord[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.session.expiresAt <= now && input.session.status !== "CONSUMED")
    return {
      ready: false,
      code: "DOCUMENT_EXPIRED" as ReadinessCode,
      missing: [],
    };
  const enabledIdentityKeys = input.session.requirements
    .filter((rule) => rule.mode !== "DISABLED")
    .map((rule) => rule.documentTypeKey);
  if (
    (input.session.identityDocumentChoice === "IDENTITY_CARD_ONLY" &&
      !enabledIdentityKeys.includes("IDENTITY_CARD")) ||
    (input.session.identityDocumentChoice === "PASSPORT_ONLY" &&
      !enabledIdentityKeys.includes("PASSPORT")) ||
    (input.session.identityDocumentChoice === "BOTH" &&
      (!enabledIdentityKeys.includes("IDENTITY_CARD") ||
        !enabledIdentityKeys.includes("PASSPORT"))) ||
    (input.session.identityDocumentChoice ===
      "EITHER_IDENTITY_CARD_OR_PASSPORT" &&
      !enabledIdentityKeys.some((key) =>
        ["IDENTITY_CARD", "PASSPORT"].includes(key),
      ))
  )
    return {
      ready: false,
      code: "DOCUMENT_POLICY_CONFLICT" as ReadinessCode,
      missing: [],
    };
  const ready = (document: DocumentRecord) =>
    document.customerUserId === input.session.customerUserId &&
    document.uploadSessionId === input.session.id &&
    document.configurationReleaseId === input.session.configurationReleaseId &&
    document.documentPolicyConfigVersionId ===
      input.session.documentPolicyConfigVersionId &&
    document.isCurrent &&
    document.deletionStatus === "RETAINED" &&
    document.retentionUntil > now &&
    document.uploadStatus === "READY" &&
    document.scanStatus === "CLEAN";
  const missing: Array<{
    documentTypeId: string;
    side: string;
    slotNumber: number;
  }> = [];
  let code: ReadinessCode = "DOCUMENT_MISSING";
  for (const rule of input.session.requirements.filter(
    (value) => value.mode === "REQUIRED",
  ))
    for (let slot = 1; slot <= rule.fileCount; slot++)
      for (const side of rule.sides === "FRONT_AND_BACK"
        ? ["FRONT", "BACK"]
        : ["SINGLE"]) {
        const candidates = input.documents.filter(
          (document) =>
            document.documentTypeId === rule.documentTypeId &&
            document.slotNumber === slot &&
            document.side === side,
        );
        if (!candidates.some(ready)) {
          missing.push({
            documentTypeId: rule.documentTypeId,
            side,
            slotNumber: slot,
          });
          if (
            candidates.some(
              (value) =>
                value.customerUserId !== input.session.customerUserId ||
                value.uploadSessionId !== input.session.id ||
                value.configurationReleaseId !==
                  input.session.configurationReleaseId ||
                value.documentPolicyConfigVersionId !==
                  input.session.documentPolicyConfigVersionId,
            )
          )
            code = "DOCUMENT_INVALID_PROVENANCE";
          else if (candidates.some((value) => value.scanStatus === "PENDING"))
            code = "DOCUMENT_PENDING_SCAN";
          else if (
            candidates.some(
              (value) =>
                ["REJECTED", "FAILED"].includes(value.uploadStatus) ||
                value.scanStatus === "INFECTED",
            )
          )
            code = "DOCUMENT_REJECTED";
        }
      }
  if (
    input.session.identityDocumentChoice === "EITHER_IDENTITY_CARD_OR_PASSPORT"
  ) {
    const identityIds = input.session.requirements
      .filter((r) => ["IDENTITY_CARD", "PASSPORT"].includes(r.documentTypeKey))
      .map((r) => r.documentTypeId);
    if (
      input.documents.some(
        (d) => identityIds.includes(d.documentTypeId) && ready(d),
      )
    )
      for (let i = missing.length - 1; i >= 0; i--)
        if (identityIds.includes(missing[i].documentTypeId))
          missing.splice(i, 1);
  }
  return {
    ready: missing.length === 0,
    code: (missing.length ? code : "DOCUMENT_READY") as ReadinessCode,
    missing,
  };
}
