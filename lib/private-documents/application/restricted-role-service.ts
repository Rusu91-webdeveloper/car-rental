import type { PrismaClient } from "@prisma/client";
import { CAPABILITIES } from "@/lib/authorization/capabilities";
import {
  requireRecentAuthentication,
  type RecentAuthenticationEvidence,
  type RecentAuthenticationVerifier,
} from "../authorization/recent-auth";
import { documentError } from "../domain/errors";
import type { DocumentActor } from "../domain/types";

export const RESTRICTED_DOCUMENT_ROLES = [
  "DOCUMENT_REVIEWER",
  "DOCUMENT_DOWNLOADER",
  "DOCUMENT_SECURITY_ADMIN",
  "DOCUMENT_RETENTION_OPERATOR",
  "DOCUMENT_INCIDENT_REVIEWER",
] as const;

export type RestrictedDocumentRole =
  (typeof RESTRICTED_DOCUMENT_ROLES)[number];

export class RestrictedDocumentRoleService {
  constructor(
    private readonly db: PrismaClient,
    private readonly recentAuth: RecentAuthenticationVerifier,
    private readonly recentAuthMaximumAgeMs = 10 * 60_000,
  ) {}

  private async authorize(input: {
    actor: DocumentActor;
    targetUserId: string;
    roleKey: RestrictedDocumentRole;
    evidence?: RecentAuthenticationEvidence;
  }) {
    if (input.actor.userId === input.targetUserId)
      documentError(
        "DOCUMENT_ACCESS_DENIED",
        "Restricted document roles cannot be self-assigned or self-revoked.",
      );
    await requireRecentAuthentication(this.recentAuth, {
      userId: input.actor.userId,
      evidence: input.evidence,
      maximumAgeMs: this.recentAuthMaximumAgeMs,
    });
    const firstSecurityAdministrator =
      input.roleKey === "DOCUMENT_SECURITY_ADMIN" &&
      (await this.db.userAccessRole.count({
        where: {
          accessRole: { key: "DOCUMENT_SECURITY_ADMIN", status: "ACTIVE" },
        },
      })) === 0;
    const permitted =
      input.actor.capabilities.has(CAPABILITIES.DOCUMENTS_SECURITY_MANAGE) ||
      (firstSecurityAdministrator &&
        input.actor.capabilities.has(CAPABILITIES.ROLES_MANAGE));
    if (!permitted)
      documentError(
        "DOCUMENT_ACCESS_DENIED",
        "Document security-management capability is required.",
      );
  }

  async assign(input: {
    actor: DocumentActor;
    targetUserId: string;
    roleKey: RestrictedDocumentRole;
    evidence?: RecentAuthenticationEvidence;
  }) {
    await this.authorize(input);
    return this.db.$transaction(async (tx) => {
      const [target, role] = await Promise.all([
        tx.user.findFirst({
          where: { id: input.targetUserId, isActive: true },
          select: { id: true },
        }),
        tx.accessRole.findFirst({
          where: { key: input.roleKey, status: "ACTIVE" },
        }),
      ]);
      if (!target || !role)
        documentError(
          "DOCUMENT_ACCESS_DENIED",
          "Active target user and bootstrapped restricted role are required.",
        );
      await tx.userAccessRole.upsert({
        where: {
          userId_accessRoleId: {
            userId: target.id,
            accessRoleId: role.id,
          },
        },
        create: { userId: target.id, accessRoleId: role.id },
        update: {},
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: input.actor.userId,
          category: "AUTHORIZATION",
          action: "document.restricted_role_assigned",
          targetType: "User",
          targetId: target.id,
          metadata: { roleKey: input.roleKey },
        },
      });
      return { targetUserId: target.id, roleKey: input.roleKey, assigned: true };
    });
  }

  async revoke(input: {
    actor: DocumentActor;
    targetUserId: string;
    roleKey: RestrictedDocumentRole;
    evidence?: RecentAuthenticationEvidence;
  }) {
    await this.authorize(input);
    return this.db.$transaction(async (tx) => {
      const role = await tx.accessRole.findUnique({
        where: { key: input.roleKey },
      });
      if (!role)
        documentError("DOCUMENT_ACCESS_DENIED", "Restricted role is missing.");
      const result = await tx.userAccessRole.deleteMany({
        where: { userId: input.targetUserId, accessRoleId: role.id },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: input.actor.userId,
          category: "AUTHORIZATION",
          action: "document.restricted_role_revoked",
          targetType: "User",
          targetId: input.targetUserId,
          metadata: { roleKey: input.roleKey, existed: result.count === 1 },
        },
      });
      return {
        targetUserId: input.targetUserId,
        roleKey: input.roleKey,
        revoked: result.count === 1,
      };
    });
  }
}
