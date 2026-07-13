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
