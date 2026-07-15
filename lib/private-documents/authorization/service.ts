import {
  CAPABILITIES,
  RESTRICTED_DOCUMENT_CAPABILITIES,
  type Capability,
} from "@/lib/authorization/capabilities";
import { documentError } from "../domain/errors";
import type { DocumentActor } from "../domain/types";
export interface PolicyPermission {
  mayView: boolean;
  mayDownload: boolean;
  mayDelete: boolean;
  mayManageLegalHold: boolean;
}
const FLAGS: Partial<Record<Capability, keyof PolicyPermission>> = {
  [CAPABILITIES.DOCUMENTS_VIEW]: "mayView",
  [CAPABILITIES.DOCUMENTS_DOWNLOAD]: "mayDownload",
  [CAPABILITIES.DOCUMENTS_DELETE]: "mayDelete",
  [CAPABILITIES.DOCUMENTS_LEGAL_HOLD_MANAGE]: "mayManageLegalHold",
};
export function requireDocumentCapability(
  actor: DocumentActor,
  capability: Capability,
  permission?: PolicyPermission,
) {
  const roles = actor.assignedRoleKeys ?? new Set<string>();
  if (
    RESTRICTED_DOCUMENT_CAPABILITIES.has(capability) &&
    (actor.role === "ADMIN" || roles.has("ADMIN_COMPAT")) &&
    ![...roles].some((key) => key.startsWith("DOCUMENT_"))
  )
    documentError(
      "DOCUMENT_ACCESS_DENIED",
      "Legacy administrator compatibility does not grant document access.",
    );
  if (!actor.capabilities.has(capability))
    documentError(
      "DOCUMENT_ACCESS_DENIED",
      "Required document capability is missing.",
    );
  const flag = FLAGS[capability];
  if (flag && (!permission || !permission[flag]))
    documentError(
      "DOCUMENT_ACCESS_DENIED",
      "The exact policy does not permit this operation.",
    );
}
