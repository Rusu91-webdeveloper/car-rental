import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("Phase 8F-B application and UI integration", () => {
  it("uses forward-only database gates for shared location and manual approval", () => {
    const migration = read("prisma/migrations/20260713141000_enforce_phase8fb_shared_location_and_review/migration.sql")
    expect(migration).toContain('CHECK ("pickupLocation" = "returnLocation")')
    expect(migration).toContain('document."manualReviewStatus" = \'APPROVED\'')
    expect(migration).toContain("BookingApplication_manual_review_gate")
  })

  it("persists checkout as an application and never calls the legacy early-booking action", () => {
    const checkout = read("app/[locale]/checkout/[id]/checkout-client.tsx")
    expect(checkout).toContain("beginBookingApplication")
    expect(checkout).toContain("Pick-up and return location")
    expect(checkout).toContain("Continue to document upload")
    expect(checkout).not.toContain("const result = await createBooking(")
  })

  it("provides opaque resume, upload, review, access, and worker routes", () => {
    for (const path of [
      "app/[locale]/applications/[applicationId]/page.tsx",
      "app/api/booking-applications/[applicationId]/upload-intents/route.ts",
      "app/api/booking-applications/[applicationId]/upload-intents/[intentId]/complete/route.ts",
      "app/[locale]/admin/documents/page.tsx",
      "app/[locale]/admin/documents/[documentId]/page.tsx",
      "app/api/private-documents/[documentId]/view/route.ts",
      "app/api/private-documents/[documentId]/download/route.ts",
      "app/api/internal/phase8fb/[job]/route.ts",
    ]) expect(read(path).length).toBeGreaterThan(20)
  })

  it("locks application and car and writes all snapshots in serializable finalization", () => {
    const adapter = read("lib/booking-applications/infrastructure/prisma-repository.ts")
    expect(adapter).toContain('FROM "BookingApplication" WHERE id = ${input.applicationId} FOR UPDATE')
    expect(adapter).toContain('FROM "Car" WHERE id = ${row.carId} FOR UPDATE')
    expect(adapter).toContain("TransactionIsolationLevel.Serializable")
    expect(adapter).toContain("maxWait: 10_000")
    expect(adapter).toContain("timeout: 30_000")
    for (const snapshot of ["bookingPricingSnapshot.create", "bookingCustomerDriverSnapshot.create", "bookingInsuranceSnapshot.create", "bookingLegalAcceptance.createMany", "customerDocument.updateMany"])
      expect(adapter).toContain(snapshot)
    expect(adapter).toContain('status: "FINALIZED"')
  })

  it("keeps interactive transactions alive through a serverless database cold start", () => {
    const database = read("lib/db.ts")
    const deployment = read("vercel.json")
    expect(database).toContain("transactionOptions")
    expect(database).toContain("maxWait: 10_000")
    expect(database).toContain("timeout: 30_000")
    expect(deployment).toContain('"regions": ["fra1"]')
  })

  it("records actionable production errors without exposing them to customers", () => {
    const actions = read("app/actions/booking-applications.ts")
    expect(actions).toContain('console.error("[BOOKING_APPLICATION_ERROR]"')
    expect(actions).toContain("error.message")
    expect(actions).toContain('error: "The application could not be saved."')
  })

  it("requires a safe private-document provider and keeps workers explicitly opt-in", () => {
    const uploads = read("lib/private-documents/server/lifecycle-context.ts")
    const workers = read("app/api/internal/phase8fb/[job]/route.ts")
    expect(uploads).toContain("!environment.featureEnabled || environment.issues.length > 0")
    expect(uploads).toContain("createPrivateDocumentStorage")
    expect(workers).toContain('process.env.PHASE8FB_WORKERS_ENABLED !== "true"')
    expect(workers).toContain("hasValidBearerSecret")
    expect(workers).toContain("PHASE8FB_WORKER_SECRET")
  })

  it("requires recent authentication for review and all sensitive administration", () => {
    const reauth = read("components/private-documents/reauthenticate-panel.tsx")
    expect(reauth).toContain("reauthenticatePrivateDocumentAccess")
    expect(read("app/[locale]/admin/documents/[documentId]/page.tsx")).toContain("RECENT_AUTH_")
    expect(read("app/[locale]/admin/documents/security/page.tsx")).toContain("requireRecentAuthentication")
  })

  it("makes the document-review handoff visible and prevents accidental cancellation", () => {
    const application = read("app/[locale]/applications/[applicationId]/booking-application-client.tsx")
    const actions = read("app/actions/booking-applications.ts")
    const trips = read("app/[locale]/bookings/page.tsx")
    const adminPage = read("app/[locale]/admin/page.tsx")
    const adminDashboard = read("app/[locale]/admin/admin-client.tsx")

    expect(application).toContain('timeZone: "Europe/Berlin"')
    expect(application).toContain("submittedForReview")
    expect(application).toContain("Documents submitted for review")
    expect(application).toContain("Cancel this booking application?")
    expect(application).toContain("Cancel permanently")
    expect(actions).toContain("submittedForReview: true")
    expect(trips).toContain("prisma.bookingApplication.findMany")
    expect(trips).toContain("Awaiting document review")
    expect(adminPage).toContain("bookingApplications={bookingApplications.map")
    expect(adminDashboard).toContain("Booking applications before confirmation")
    expect(adminDashboard).toContain("Reviewer access is missing")
    expect(adminDashboard).toContain("DOCUMENT_REVIEWER")
  })

  it("groups private documents into an application review workspace", () => {
    const queue = read("app/[locale]/admin/documents/review-queue-client.tsx")
    const workspace = read("app/[locale]/admin/documents/applications/[applicationId]/page.tsx")
    const presenter = read("lib/private-documents/application/review-queue-presenter.ts")
    const documentReview = read("app/[locale]/admin/documents/[documentId]/review-client.tsx")

    expect(queue).toContain("groupIntoCases")
    expect(queue).toContain("Review application")
    expect(queue).toContain("Document review progress")
    expect(presenter).toContain("bookingApplication")
    expect(presenter).toContain("approvedDocuments")
    expect(workspace).toContain("Customer and driver")
    expect(workspace).toContain("Document checklist")
    expect(workspace).toContain("Legal acceptances")
    expect(documentReview).toContain("router.push(returnTo)")
  })
})
