import { documentError } from "../domain/errors";
export const PROVISIONAL_RETENTION = {
  defaultDaysAfterCompletion: 90,
  hardMaximumDays: 365,
  deletionGraceDays: 7,
} as const;
const DAY = 86_400_000;
export type RetentionBasis =
  | "UPLOAD_SESSION_EXPIRY"
  | "BOOKING_CANCELLED"
  | "RENTAL_COMPLETED"
  | "REJECTED_UPLOAD"
  | "INCIDENT_PRESERVATION";
export function calculateRetention(input: {
  basis: Exclude<RetentionBasis, "INCIDENT_PRESERVATION">;
  basisAt: Date;
  requestedDays?: number;
  sessionExpiresAt?: Date;
}) {
  const days =
    input.requestedDays ?? PROVISIONAL_RETENTION.defaultDaysAfterCompletion;
  if (days < 1 || days > PROVISIONAL_RETENTION.hardMaximumDays)
    documentError(
      "DOCUMENT_DELETION_NOT_ELIGIBLE",
      "Retention is outside provisional bounds.",
    );
  const retentionUntil =
    input.basis === "UPLOAD_SESSION_EXPIRY"
      ? input.sessionExpiresAt
      : new Date(input.basisAt.getTime() + days * DAY);
  if (!retentionUntil || retentionUntil < input.basisAt)
    documentError(
      "DOCUMENT_DELETION_NOT_ELIGIBLE",
      "Absolute retention deadline is invalid.",
    );
  return {
    basis: input.basis,
    basisAt: input.basisAt,
    policyDaysSnapshot: days,
    hardMaximumDaysSnapshot: 365,
    retentionUntil,
    deletionEligibleAt: new Date(retentionUntil),
    deletionMustCompleteBy: new Date(retentionUntil.getTime() + 7 * DAY),
    provisional: true as const,
  };
}
export function deletionIsEligible(input: {
  now: Date;
  deletionEligibleAt: Date;
  activeLegalHold: boolean;
}) {
  return !input.activeLegalHold && input.now >= input.deletionEligibleAt;
}
