import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  resolve(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260713140000_add_phase8fb_booking_application/migration.sql",
  ),
  "utf8",
);

describe("Phase 8F-B booking application persistence", () => {
  it("keeps pre-booking state typed and release-backed", () => {
    for (const model of [
      "BookingApplication",
      "BookingApplicationCustomerDriver",
      "BookingApplicationInsuranceSelection",
      "BookingApplicationPaymentSelection",
      "BookingApplicationPricingQuote",
      "BookingApplicationLegalAcceptance",
    ])
      expect(schema).toContain(`model ${model} {`);

    for (const provenanceField of [
      "generalRentalConfigVersionId",
      "pricingBillingConfigVersionId",
      "fleetRateSetId",
      "insuranceConfigVersionId",
      "customerDriverConfigVersionId",
      "bookingWorkflowConfigVersionId",
      "documentPolicyConfigVersionId",
      "paymentConfigVersionId",
      "confirmationConfigVersionId",
      "legalAcceptanceConfigVersionId",
    ])
      expect(schema).toContain(provenanceField);
  });

  it("persists the historical-compatible upload-session binding", () => {
    expect(schema).toContain("bookingApplicationId          String?");
    expect(migration).toContain(
      'ALTER TABLE "DocumentUploadSession" ADD COLUMN     "bookingApplicationId" TEXT;',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "DocumentUploadSession_bookingApplicationId_key"',
    );
  });

  it("enforces readiness, append-only evidence, expiry, and finalization", () => {
    for (const protection of [
      "assert_booking_application_ready",
      "BookingApplication_no_delete",
      "BookingApplicationPricingQuote_one_current_key",
      "BookingApplicationLegalAcceptance_append_only",
      "DocumentUploadIntent_booking_application_guard",
      "BookingApplication_finalization_consistency",
    ])
      expect(migration).toContain(protection);
  });
});
