import type { PrivateObjectReference, ScanOutcome } from "../domain/types";
export interface ScannerHealth {
  configured: boolean;
  productionReady: boolean;
  scannerKey: string;
  issues: string[];
}
export interface ScanRequest {
  requestId: string;
  idempotencyKey: string;
  object: PrivateObjectReference;
  checksumSha256: string;
  testDirective?: ScanOutcome;
}
export interface NormalizedScanResult {
  requestId: string;
  providerReference: string;
  providerEventId: string;
  outcome: ScanOutcome;
  safeResultCode: string;
  retryable: boolean;
  startedAt: Date;
  completedAt: Date;
  sanitizedMetadata?: Record<string, string | number | boolean>;
}
export interface MalwareScanner {
  readonly scannerKey: string;
  verifyScannerConfiguration(): Promise<ScannerHealth>;
  requestScan(input: Omit<ScanRequest, "requestId">): Promise<ScanRequest>;
  getScanResult(requestId: string): Promise<NormalizedScanResult | undefined>;
  processScanResult(requestId: string): Promise<NormalizedScanResult>;
}
