import type { Prisma, PrismaClient } from "@prisma/client"
import {
  RESTRICTED_DOCUMENT_CAPABILITIES,
  type Capability,
} from "./capabilities"

type DbClient = PrismaClient | Prisma.TransactionClient

export async function databaseUserHasCapability(
  db: DbClient,
  userId: string,
  capability: Capability,
) {
  const actor = await db.user.findFirst({
    where: { id: userId, isActive: true },
    select: {
      role: true,
      accessRoleAssignments: {
        where: { accessRole: { status: "ACTIVE" } },
        select: {
          accessRole: {
            select: {
              key: true,
              capabilities: {
                select: { capability: { select: { key: true } } },
              },
            },
          },
        },
      },
    },
  })
  return (
    (actor?.role === "ADMIN" &&
      !RESTRICTED_DOCUMENT_CAPABILITIES.has(capability)) ||
    actor?.accessRoleAssignments.some(
      ({ accessRole }) =>
        (accessRole.key !== "ADMIN_COMPAT" ||
          !RESTRICTED_DOCUMENT_CAPABILITIES.has(capability)) &&
        accessRole.capabilities.some(
          ({ capability: assigned }) => assigned.key === capability,
        ),
    ) ||
    false
  )
}
