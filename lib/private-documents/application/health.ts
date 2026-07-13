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
  scanner: MalwareScanner;
  recentAuthenticationOperational: boolean;
  restrictedRoleAssigned: boolean;
  auditPersistenceOperational: boolean;
  retentionWorkerOperational: boolean;
  deletionWorkerOperational: boolean;
  provisionalBlockersResolved: boolean;
}) {
  const [storage, scanner] = await Promise.all([
    input.storage.verifyProviderConfiguration(),
    input.scanner.verifyScannerConfiguration(),
  ]);
  const codes = new Set([...storage.issues, ...scanner.issues]);
  if (storage.providerKey !== "vercel-blob-private")
    codes.add("DOCUMENT_PRODUCTION_STORAGE_NOT_CONFIGURED");
  if (!storage.productionReady)
    codes.add("DOCUMENT_PRODUCTION_STORAGE_NOT_CONFIGURED");
  if (!scanner.productionReady)
    codes.add("DOCUMENT_PRODUCTION_SCANNER_NOT_CONFIGURED");
  if (!input.recentAuthenticationOperational)
    codes.add("DOCUMENT_RECENT_AUTH_NOT_OPERATIONAL");
  if (!input.restrictedRoleAssigned)
    codes.add("DOCUMENT_RESTRICTED_ROLE_NOT_ASSIGNED");
  if (!input.auditPersistenceOperational)
    codes.add("DOCUMENT_AUDIT_PERSISTENCE_NOT_OPERATIONAL");
  if (!input.retentionWorkerOperational)
    codes.add("DOCUMENT_RETENTION_WORKER_NOT_OPERATIONAL");
  if (!input.deletionWorkerOperational)
    codes.add("DOCUMENT_DELETION_WORKER_NOT_OPERATIONAL");
  if (!input.provisionalBlockersResolved)
    codes.add("DOCUMENT_PROVISIONAL_PRODUCTION_BLOCKERS_UNRESOLVED");
  const productionReady =
    storage.productionReady &&
    scanner.productionReady &&
    input.recentAuthenticationOperational &&
    input.restrictedRoleAssigned &&
    input.auditPersistenceOperational &&
    input.retentionWorkerOperational &&
    input.deletionWorkerOperational &&
    input.provisionalBlockersResolved;
  if (productionReady) codes.add("DOCUMENT_PRODUCTION_READY");
  return { productionReady, codes: [...codes], storage, scanner };
}
