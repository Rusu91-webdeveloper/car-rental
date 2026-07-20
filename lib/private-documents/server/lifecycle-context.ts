import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { PrivateDocumentLifecycleService } from "../application/lifecycle-service"
import { documentError } from "../domain/errors"
import { readPrivateDocumentEnvironment } from "../infrastructure/environment"
import { PrismaDocumentLifecycleRepository } from "../infrastructure/prisma-repository"
import { DeterministicFakeMalwareScanner } from "../scanning/fake-scanner"
import { createPrivateDocumentStorage } from "../storage/factory"

export async function loadOwnedApplicationDocumentLifecycle(applicationId: string) {
  const user = await requireAuth()
  const application = await prisma.bookingApplication.findUnique({
    where: { id: applicationId },
    include: { documentUploadSession: true },
  })
  if (!application || application.customerUserId !== user.id)
    documentError("DOCUMENT_ACCESS_DENIED", "Application is unavailable.")
  if (!application.documentUploadSession)
    documentError("DOCUMENT_SESSION_NOT_FOUND", "Upload session is unavailable.")
  const environment = readPrivateDocumentEnvironment()
  if (!environment.featureEnabled || environment.issues.length > 0)
    documentError(
      "DOCUMENT_PROVIDER_STORE_UNAVAILABLE",
      "Private document uploads are not safely configured.",
    )
  const repository = new PrismaDocumentLifecycleRepository(prisma)
  const storage = createPrivateDocumentStorage({
    environment,
    localRoot: process.env.PRIVATE_DOCUMENT_LOCAL_ROOT ?? "/tmp/car-rental-private-documents",
  })
  return {
    user,
    application,
    session: application.documentUploadSession,
    lifecycle: new PrivateDocumentLifecycleService(
      repository,
      storage,
      new DeterministicFakeMalwareScanner(),
      undefined,
      3,
      "MANUAL_REVIEW",
    ),
  }
}
