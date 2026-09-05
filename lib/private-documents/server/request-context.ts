import { auth } from "@/lib/auth";
import { CAPABILITIES, type Capability } from "@/lib/authorization/capabilities";
import { PrismaCapabilityRepository } from "@/lib/authorization/capability-repository";
import { prisma } from "@/lib/db";
import { DocumentAccessService } from "../application/access-service";
import { ManualDocumentReviewService } from "../application/manual-review-service";
import { RestrictedDocumentRoleService } from "../application/restricted-role-service";
import { ServerSessionRecentAuthenticationVerifier } from "../authorization/recent-auth";
import type { PolicyPermission } from "../authorization/service";
import { documentError } from "../domain/errors";
import type { DocumentActor } from "../domain/types";
import { readPrivateDocumentEnvironment } from "../infrastructure/environment";
import { PrismaDocumentLifecycleRepository } from "../infrastructure/prisma-repository";
import { readRuntimePrivateDocumentEnvironment } from "../infrastructure/runtime-environment";
import { createPrivateDocumentStorage } from "../storage/factory";

function serverAuthenticationEvidence(session: unknown) {
  const value = session as {
    authenticationProvider?: unknown;
    googleAuthenticatedAt?: unknown;
  };
  if (
    value.authenticationProvider !== "google" ||
    typeof value.googleAuthenticatedAt !== "number" ||
    !Number.isFinite(value.googleAuthenticatedAt)
  )
    return undefined;
  return {
    provider: "google" as const,
    authenticatedAt: new Date(value.googleAuthenticatedAt),
    serverVerified: true as const,
  };
}

export async function loadPrivateDocumentRequestContext(documentId: string) {
  const session = await auth();
  if (!session?.user?.id)
    documentError("DOCUMENT_ACCESS_DENIED", "Authentication is required.");
  const user = await prisma.user.findFirst({
    where: { id: session.user.id, isActive: true },
    select: {
      id: true,
      role: true,
      accessRoleAssignments: {
        where: { accessRole: { status: "ACTIVE" } },
        select: { accessRole: { select: { id: true, key: true } } },
      },
    },
  });
  if (!user)
    documentError("DOCUMENT_ACCESS_DENIED", "Active user is required.");
  const document = await prisma.customerDocument.findUnique({
    where: { id: documentId },
    select: {
      documentPolicyConfigVersionId: true,
      bookingId: true,
      customerUserId: true,
      uploadSessionId: true,
    },
  });
  if (!document?.documentPolicyConfigVersionId)
    documentError("DOCUMENT_NOT_ACCESSIBLE", "Document is unavailable.");

  const roleIds = user.accessRoleAssignments.map(
    ({ accessRole }) => accessRole.id,
  );
  const permissions = await prisma.documentPolicyRolePermission.findMany({
    where: {
      documentPolicyConfigVersionId: document.documentPolicyConfigVersionId,
      accessRoleId: { in: roleIds },
    },
  });
  const permission: PolicyPermission = {
    mayView: permissions.some((value) => value.mayView),
    mayDownload: permissions.some((value) => value.mayDownload),
    mayDelete: permissions.some((value) => value.mayDelete),
    mayManageLegalHold: permissions.some(
      (value) => value.mayManageLegalHold,
    ),
  };
  const capabilities = await new PrismaCapabilityRepository(
    prisma,
  ).findCapabilitiesForUser(user.id);
  const actor: DocumentActor = {
    userId: user.id,
    role: user.role,
    capabilities,
    assignedRoleKeys: new Set(
      user.accessRoleAssignments.map(({ accessRole }) => accessRole.key),
    ),
  };
  const environment = await readRuntimePrivateDocumentEnvironment();
  const repository = new PrismaDocumentLifecycleRepository(prisma);
  const storage = createPrivateDocumentStorage({
    environment,
    localRoot:
      process.env.PRIVATE_DOCUMENT_LOCAL_ROOT ??
      "/tmp/car-rental-private-documents",
  });
  const recentAuth = new ServerSessionRecentAuthenticationVerifier();
  return {
    actor,
    permission,
    evidence: serverAuthenticationEvidence(session),
    recentAuthMaximumAgeMs: environment.recentAuthMaximumAgeSeconds * 1000,
    scope: {
      bookingId: document.bookingId ?? undefined,
      customerUserId: document.customerUserId,
      uploadSessionId: document.uploadSessionId ?? undefined,
    },
    access: new DocumentAccessService(repository, storage, recentAuth),
    reviews: new ManualDocumentReviewService(
      repository,
      recentAuth,
      environment.recentAuthMaximumAgeSeconds * 1000,
    ),
    repository,
  };
}

export async function loadRestrictedDocumentActor() {
  const session = await auth();
  if (!session?.user?.id)
    documentError("DOCUMENT_ACCESS_DENIED", "Authentication is required.");
  const user = await prisma.user.findFirst({
    where: { id: session.user.id, isActive: true },
    select: {
      id: true,
      role: true,
      accessRoleAssignments: {
        where: { accessRole: { status: "ACTIVE" } },
        select: { accessRole: { select: { key: true } } },
      },
    },
  });
  if (!user)
    documentError("DOCUMENT_ACCESS_DENIED", "Active user is required.");
  const capabilities = await new PrismaCapabilityRepository(
    prisma,
  ).findCapabilitiesForUser(user.id);
  const environment = readPrivateDocumentEnvironment();
  const recentAuth = new ServerSessionRecentAuthenticationVerifier();
  const repository = new PrismaDocumentLifecycleRepository(prisma);
  return {
    actor: {
      userId: user.id,
      role: user.role,
      capabilities,
      assignedRoleKeys: new Set(
        user.accessRoleAssignments.map(({ accessRole }) => accessRole.key),
      ),
    } satisfies DocumentActor,
    evidence: serverAuthenticationEvidence(session),
    reviews: new ManualDocumentReviewService(
      repository,
      recentAuth,
      environment.recentAuthMaximumAgeSeconds * 1000,
    ),
    roles: new RestrictedDocumentRoleService(
      prisma,
      recentAuth,
      environment.recentAuthMaximumAgeSeconds * 1000,
    ),
  };
}

export function isKnownCapability(value: string): value is Capability {
  return (Object.values(CAPABILITIES) as string[]).includes(value);
}
