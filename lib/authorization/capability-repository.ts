import type { Prisma, PrismaClient } from "@prisma/client"
import {
  CAPABILITIES,
  RESTRICTED_DOCUMENT_CAPABILITIES,
  type Capability,
} from "./capabilities"

type DbClient = PrismaClient | Prisma.TransactionClient

export interface CapabilityRepository {
  findCapabilitiesForUser(userId: string): Promise<ReadonlySet<Capability>>
}

export class PrismaCapabilityRepository implements CapabilityRepository {
  constructor(private readonly db: DbClient) {}

  async findCapabilitiesForUser(
    userId: string,
  ): Promise<ReadonlySet<Capability>> {
    const assignments = await this.db.userAccessRole.findMany({
      where: { userId, accessRole: { status: "ACTIVE" } },
      select: {
        accessRole: {
          select: {
            key: true,
            capabilities: { select: { capability: { select: { key: true } } } },
          },
        },
      },
    })
    const known = new Set<string>(Object.values(CAPABILITIES))
    return new Set(
      assignments
        .flatMap(({ accessRole }) =>
          accessRole.capabilities.map(({ capability }) => ({
            roleKey: accessRole.key,
            key: capability.key,
          })),
        )
        .filter(
          ({ roleKey, key }) =>
            roleKey !== "ADMIN_COMPAT" ||
            !RESTRICTED_DOCUMENT_CAPABILITIES.has(key as Capability),
        )
        .map(({ key }) => key)
        .filter((key): key is Capability => known.has(key)),
    )
  }
}
