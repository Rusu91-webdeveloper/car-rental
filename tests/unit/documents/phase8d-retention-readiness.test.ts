import { describe, expect, it } from "vitest";
import { resolveDocumentReadiness } from "@/lib/private-documents/application/readiness";
import type {
  DocumentRecord,
  SessionRecord,
} from "@/lib/private-documents/application/repository";
import {
  calculateRetention,
  deletionIsEligible,
} from "@/lib/private-documents/retention/calculator";

const day = 86_400_000;
const basisAt = new Date("2026-07-13T00:00:00Z");

describe("Phase 8D retention evidence", () => {
  it.each(["RENTAL_COMPLETED", "BOOKING_CANCELLED"] as const)(
    "persists an absolute %s deadline from the historical basis",
    (basis) => {
      const result = calculateRetention({ basis, basisAt });
      expect(result.policyDaysSnapshot).toBe(90);
      expect(result.hardMaximumDaysSnapshot).toBe(365);
      expect(result.retentionUntil.getTime()).toBe(
        basisAt.getTime() + 90 * day,
      );
      expect(result.deletionMustCompleteBy.getTime()).toBe(
        result.deletionEligibleAt.getTime() + 7 * day,
      );
    },
  );

  it("uses an absolute pre-booking session deadline and suspends deletion for hold", () => {
    const sessionExpiresAt = new Date(basisAt.getTime() + 2 * day);
    const result = calculateRetention({
      basis: "UPLOAD_SESSION_EXPIRY",
      basisAt,
      requestedDays: 30,
      sessionExpiresAt,
    });
    expect(result.retentionUntil).toEqual(sessionExpiresAt);
    expect(
      deletionIsEligible({
        now: new Date(sessionExpiresAt.getTime() + 1),
        deletionEligibleAt: result.deletionEligibleAt,
        activeLegalHold: true,
      }),
    ).toBe(false);
  });

  it("rejects retention beyond the provisional hard maximum", () => {
    expect(() =>
      calculateRetention({
        basis: "RENTAL_COMPLETED",
        basisAt,
        requestedDays: 366,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "DOCUMENT_DELETION_NOT_ELIGIBLE" }),
    );
  });
});

describe("Phase 8D readiness issue codes", () => {
  const session: SessionRecord = {
    id: "session-1",
    customerUserId: "customer-1",
    carId: "car-1",
    pickupAt: new Date(basisAt.getTime() + day),
    returnAt: new Date(basisAt.getTime() + 2 * day),
    locale: "en",
    configurationReleaseId: "release-1",
    documentPolicyConfigVersionId: "policy-1",
    retentionPreferenceDays: 90,
    identityDocumentChoice: "IDENTITY_CARD_ONLY",
    requirements: [
      {
        documentTypeId: "identity",
        documentTypeKey: "IDENTITY_CARD",
        mode: "REQUIRED",
        fileCount: 1,
        sides: "SINGLE_FILE",
        uploadStage: "DURING_BOOKING",
      },
    ],
    status: "OPEN",
    revision: 1,
    expiresAt: new Date(basisAt.getTime() + 10 * day),
  };
  const document: DocumentRecord = {
    id: "document-1",
    customerUserId: "customer-1",
    uploadedById: "customer-1",
    documentTypeId: "identity",
    side: "SINGLE",
    slotNumber: 1,
    attemptNumber: 1,
    uploadSessionId: session.id,
    uploadIntentId: "intent-1",
    configurationReleaseId: session.configurationReleaseId,
    documentPolicyConfigVersionId: session.documentPolicyConfigVersionId,
    object: {
      providerKey: "fixture",
      region: "local",
      containerId: "private",
      objectKey: "opaque",
      namespace: "approved",
    },
    validation: {
      normalizedExtension: ".jpg",
      declaredMimeType: "image/jpeg",
      detectedMimeType: "image/jpeg",
      detectedFileType: "JPEG",
      sizeBytes: 8,
      checksumSha256: "a".repeat(64),
    },
    uploadStatus: "READY",
    scanStatus: "CLEAN",
    scanAttemptCount: 1,
    isCurrent: true,
    retentionUntil: new Date(basisAt.getTime() + 9 * day),
    deletionEligibleAt: new Date(basisAt.getTime() + 9 * day),
    retentionBasis: "UPLOAD_SESSION_EXPIRY",
    legalHold: false,
    deletionStatus: "RETAINED",
  };

  it("distinguishes pending, rejected, invalid provenance, and policy conflict", () => {
    expect(
      resolveDocumentReadiness({
        session,
        documents: [
          { ...document, uploadStatus: "VERIFYING", scanStatus: "PENDING" },
        ],
        now: basisAt,
      }).code,
    ).toBe("DOCUMENT_PENDING_SCAN");
    expect(
      resolveDocumentReadiness({
        session,
        documents: [
          { ...document, uploadStatus: "REJECTED", scanStatus: "INFECTED" },
        ],
        now: basisAt,
      }).code,
    ).toBe("DOCUMENT_REJECTED");
    expect(
      resolveDocumentReadiness({
        session,
        documents: [{ ...document, configurationReleaseId: "wrong-release" }],
        now: basisAt,
      }).code,
    ).toBe("DOCUMENT_INVALID_PROVENANCE");
    expect(
      resolveDocumentReadiness({
        session: { ...session, requirements: [] },
        documents: [],
        now: basisAt,
      }).code,
    ).toBe("DOCUMENT_POLICY_CONFLICT");
  });
});
