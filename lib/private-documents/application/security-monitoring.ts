import type { SafeAuditInput } from "../domain/types";

export interface DocumentSecuritySignals {
  unauthorizedAccessAttempts: number;
  legacyAdministratorAttempts: number;
  rejectedUploads: number;
  blobFailures: number;
  checksumMismatches: number;
  cleanupFailures: number;
  retentionEvents: number;
  deletionFailures: number;
  restrictedRoleChanges: number;
}

export function summarizeDocumentSecuritySignals(
  events: readonly SafeAuditInput[],
): DocumentSecuritySignals {
  const result: DocumentSecuritySignals = {
    unauthorizedAccessAttempts: 0,
    legacyAdministratorAttempts: 0,
    rejectedUploads: 0,
    blobFailures: 0,
    checksumMismatches: 0,
    cleanupFailures: 0,
    retentionEvents: 0,
    deletionFailures: 0,
    restrictedRoleChanges: 0,
  };
  for (const event of events.slice(-10_000)) {
    if (
      [
        "document.access_denied",
        "document.view_denied",
        "document.download_denied",
      ].includes(event.action)
    )
      result.unauthorizedAccessAttempts++;
    if (event.metadata?.legacyCompatibilityAttempt === true)
      result.legacyAdministratorAttempts++;
    if (
      ["document.rejected", "document.replacement_requested"].includes(
        event.action,
      )
    )
      result.rejectedUploads++;
    if (
      event.action.includes("provider") ||
      event.metadata?.code === "DOCUMENT_PROVIDER_OPERATION_FAILED"
    )
      result.blobFailures++;
    if (event.metadata?.code === "DOCUMENT_UPLOAD_METADATA_MISMATCH")
      result.checksumMismatches++;
    if (event.action === "document.cleanup_failed") result.cleanupFailures++;
    if (event.action === "document.retention_deadline_calculated")
      result.retentionEvents++;
    if (event.action === "document.deletion_attempt_failed")
      result.deletionFailures++;
    if (
      [
        "document.restricted_role_assigned",
        "document.restricted_role_revoked",
      ].includes(event.action)
    )
      result.restrictedRoleChanges++;
  }
  return result;
}
