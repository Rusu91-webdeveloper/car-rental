import type { MalwareScanner } from "../scanning/contracts";
import type { PrivateDocumentStorage } from "../storage/contracts";

export async function evaluateDocumentInfrastructureHealth(input: {
  storage: PrivateDocumentStorage;
  scanner: MalwareScanner;
  policyValid: boolean;
  capabilitiesReady: boolean;
  retentionReady: boolean;
  workflowReady: boolean;
}) {
  const [storage, scanner] = await Promise.all([
    input.storage.verifyProviderConfiguration(),
    input.scanner.verifyScannerConfiguration(),
  ]);
  const codes = new Set([...storage.issues, ...scanner.issues]);
  if (!storage.productionReady)
    codes.add("DOCUMENT_PRODUCTION_STORAGE_NOT_CONFIGURED");
  if (!scanner.productionReady)
    codes.add("DOCUMENT_PRODUCTION_SCANNER_NOT_CONFIGURED");
  const lifecycleReady =
    storage.configured &&
    storage.privateAccess &&
    scanner.configured &&
    input.policyValid &&
    input.capabilitiesReady &&
    input.retentionReady &&
    input.workflowReady;
  if (lifecycleReady)
    codes.add("DOCUMENT_LIFECYCLE_READY_FOR_PROVIDER_INTEGRATION");
  return {
    productionReady:
      lifecycleReady && storage.productionReady && scanner.productionReady,
    lifecycleReadyForProviderIntegration: lifecycleReady,
    codes: [...codes],
  };
}

export async function evaluateProductionDocumentHealth(input: {
  storage: PrivateDocumentStorage;
  scanner?: MalwareScanner;
  reviewMode?: "MANUAL_REVIEW" | "AUTOMATED_SCANNER";
  recentAuthenticationOperational: boolean;
  restrictedRoleAssigned?: boolean;
  reviewerRoleAssigned?: boolean;
  downloaderRoleAssigned?: boolean;
  downloadsEnabled?: boolean;
  reviewQueueOperational?: boolean;
  technicalValidationOperational?: boolean;
  auditPersistenceOperational: boolean;
  cleanupWorkerOperational?: boolean;
  retentionWorkerOperational: boolean;
  deletionWorkerOperational: boolean;
  policyAndRetentionConfirmed?: boolean;
  localAdapterDisabled?: boolean;
  scannerPathDisabled?: boolean;
  provisionalBlockersResolved: boolean;
}) {
  const reviewMode = input.reviewMode ?? "AUTOMATED_SCANNER";
  const storage = await input.storage.verifyProviderConfiguration();
  const scanner =
    reviewMode === "AUTOMATED_SCANNER" && input.scanner
      ? await input.scanner.verifyScannerConfiguration()
      : undefined;
  const codes = new Set([...storage.issues, ...(scanner?.issues ?? [])]);

  if (storage.providerKey !== "vercel-blob-private" || !storage.productionReady)
    codes.add("DOCUMENT_PRODUCTION_STORAGE_NOT_CONFIGURED");
  if (!input.recentAuthenticationOperational)
    codes.add("DOCUMENT_REAUTH_NOT_CONFIGURED");
  if (!input.recentAuthenticationOperational)
    codes.add("DOCUMENT_RECENT_AUTH_NOT_OPERATIONAL");
  if (!input.auditPersistenceOperational)
    codes.add("DOCUMENT_AUDIT_PERSISTENCE_NOT_OPERATIONAL");
  if (!input.retentionWorkerOperational)
    codes.add("DOCUMENT_RETENTION_WORKER_UNAVAILABLE");
  if (!input.deletionWorkerOperational)
    codes.add("DOCUMENT_DELETION_WORKER_UNAVAILABLE");
  if (!input.provisionalBlockersResolved)
    codes.add("DOCUMENT_PROVISIONAL_PRODUCTION_BLOCKERS_UNRESOLVED");

  if (reviewMode === "MANUAL_REVIEW") {
    const reviewerAssigned =
      input.reviewerRoleAssigned ?? input.restrictedRoleAssigned ?? false;
    if (!reviewerAssigned)
      codes.add("DOCUMENT_REVIEWER_ROLE_UNASSIGNED");
    if (input.downloadsEnabled && !input.downloaderRoleAssigned)
      codes.add("DOCUMENT_DOWNLOADER_ROLE_UNASSIGNED");
    if (!input.reviewQueueOperational)
      codes.add("DOCUMENT_REVIEW_QUEUE_UNAVAILABLE");
    if (!input.technicalValidationOperational)
      codes.add("DOCUMENT_TECHNICAL_VALIDATION_UNAVAILABLE");
    if (!input.cleanupWorkerOperational)
      codes.add("DOCUMENT_CLEANUP_WORKER_UNAVAILABLE");
    if (!input.policyAndRetentionConfirmed)
      codes.add("DOCUMENT_POLICY_RETENTION_UNCONFIRMED");
    if (!input.localAdapterDisabled)
      codes.add("DOCUMENT_LOCAL_ADAPTER_ENABLED");
    if (!input.scannerPathDisabled)
      codes.add("DOCUMENT_MANUAL_REVIEW_NOT_CONFIGURED");
    const productionReady =
      storage.productionReady &&
      input.recentAuthenticationOperational &&
      reviewerAssigned &&
      (!input.downloadsEnabled || Boolean(input.downloaderRoleAssigned)) &&
      Boolean(input.reviewQueueOperational) &&
      Boolean(input.technicalValidationOperational) &&
      input.auditPersistenceOperational &&
      Boolean(input.cleanupWorkerOperational) &&
      input.retentionWorkerOperational &&
      input.deletionWorkerOperational &&
      Boolean(input.policyAndRetentionConfirmed) &&
      Boolean(input.localAdapterDisabled) &&
      Boolean(input.scannerPathDisabled) &&
      input.provisionalBlockersResolved;
    if (productionReady) codes.add("DOCUMENT_PRODUCTION_READY");
    return { productionReady, codes: [...codes], storage, scanner };
  }

  if (!scanner?.productionReady)
    codes.add("DOCUMENT_PRODUCTION_SCANNER_NOT_CONFIGURED");
  if (!input.restrictedRoleAssigned)
    codes.add("DOCUMENT_RESTRICTED_ROLE_NOT_ASSIGNED");
  const productionReady =
    storage.productionReady &&
    Boolean(scanner?.productionReady) &&
    input.recentAuthenticationOperational &&
    Boolean(input.restrictedRoleAssigned) &&
    input.auditPersistenceOperational &&
    input.retentionWorkerOperational &&
    input.deletionWorkerOperational &&
    input.provisionalBlockersResolved;
  if (productionReady) codes.add("DOCUMENT_PRODUCTION_READY");
  return { productionReady, codes: [...codes], storage, scanner };
}
