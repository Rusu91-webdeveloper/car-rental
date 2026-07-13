import { randomUUID } from "node:crypto";
import { documentError } from "../domain/errors";
import type { ScanOutcome } from "../domain/types";
import type {
  MalwareScanner,
  NormalizedScanResult,
  ScanRequest,
  ScannerHealth,
} from "./contracts";

export class DeterministicFakeMalwareScanner implements MalwareScanner {
  readonly scannerKey = "deterministic-fake-scanner";
  private requests = new Map<string, ScanRequest>();
  private idempotency = new Map<string, string>();
  private results = new Map<string, NormalizedScanResult>();
  constructor(private readonly now: () => Date = () => new Date()) {}
  async verifyScannerConfiguration(): Promise<ScannerHealth> {
    return {
      configured: true,
      productionReady: false,
      scannerKey: this.scannerKey,
      issues: ["DOCUMENT_FAKE_SCANNER_ONLY"],
    };
  }
  async requestScan(input: Omit<ScanRequest, "requestId">) {
    const existingId = this.idempotency.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.requests.get(existingId)!;
      if (
        existing.checksumSha256 !== input.checksumSha256 ||
        existing.object.objectKey !== input.object.objectKey ||
        existing.testDirective !== input.testDirective
      )
        documentError(
          "DOCUMENT_IDEMPOTENCY_CONFLICT",
          "Scan idempotency was reused inconsistently.",
        );
      return existing;
    }
    const request = { ...input, requestId: randomUUID() };
    this.requests.set(request.requestId, request);
    this.idempotency.set(request.idempotencyKey, request.requestId);
    return request;
  }
  async getScanResult(requestId: string) {
    return this.results.get(requestId);
  }
  async processScanResult(requestId: string) {
    const existing = this.results.get(requestId);
    if (existing) return existing;
    const request = this.requests.get(requestId);
    if (!request)
      documentError(
        "DOCUMENT_UPLOAD_NOT_FOUND",
        "Fake scan request was not found.",
      );
    const outcome: ScanOutcome = request.testDirective ?? "CLEAN";
    const startedAt = this.now();
    const result: NormalizedScanResult = {
      requestId,
      providerReference: `fake-request-${requestId}`,
      providerEventId: `fake-event-${requestId}`,
      outcome,
      safeResultCode: `FAKE_${outcome}`,
      retryable: outcome === "ERROR" || outcome === "TIMEOUT",
      startedAt,
      completedAt: new Date(
        Math.max(startedAt.getTime(), this.now().getTime()),
      ),
      sanitizedMetadata: { engine: "deterministic-fixture-v1" },
    };
    this.results.set(requestId, result);
    return result;
  }
}
