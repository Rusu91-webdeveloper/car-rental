import "server-only"

import type { Prisma, PrismaClient } from "@prisma/client"

type DbClient = PrismaClient | Prisma.TransactionClient

export type AdminCarPublishingStatus =
  | "PUBLISHED"
  | "PUBLISHED_WITH_CHANGES"
  | "DRAFT"
  | "NEEDS_PRICING"

type Rate = {
  carId: string
  dailyRate: number
  weeklyRate: number | null
  monthlyRate: number | null
  weeklyRateEnabled: boolean
  monthlyRateEnabled: boolean
}

function ratesMatch(left: Rate, right: Rate): boolean {
  return (
    left.dailyRate === right.dailyRate &&
    left.weeklyRate === right.weeklyRate &&
    left.monthlyRate === right.monthlyRate &&
    left.weeklyRateEnabled === right.weeklyRateEnabled &&
    left.monthlyRateEnabled === right.monthlyRateEnabled
  )
}

export async function getAdminCarPublishingStatuses(
  db: DbClient,
  carIds: string[],
): Promise<Map<string, AdminCarPublishingStatus>> {
  if (carIds.length === 0) return new Map()

  const rateSelect = {
    carId: true,
    dailyRate: true,
    weeklyRate: true,
    monthlyRate: true,
    weeklyRateEnabled: true,
    monthlyRateEnabled: true,
  } as const

  const [activeRelease, pendingRelease] = await Promise.all([
    db.businessConfigurationRelease.findFirst({
      where: { status: "ACTIVE" },
      select: {
        fleetRateSet: {
          select: {
            rates: { where: { carId: { in: carIds } }, select: rateSelect },
          },
        },
      },
    }),
    db.businessConfigurationRelease.findFirst({
      where: { status: { in: ["DRAFT", "VALIDATED"] } },
      orderBy: { updatedAt: "desc" },
      select: {
        fleetRateSet: {
          select: {
            rates: { where: { carId: { in: carIds } }, select: rateSelect },
          },
        },
      },
    }),
  ])

  const liveRates = new Map(activeRelease?.fleetRateSet.rates.map((rate) => [rate.carId, rate]) ?? [])
  const draftRates = new Map(pendingRelease?.fleetRateSet.rates.map((rate) => [rate.carId, rate]) ?? [])

  return new Map(
    carIds.map((carId) => {
      const live = liveRates.get(carId)
      const draft = draftRates.get(carId)

      if (!live) return [carId, draft ? "DRAFT" : "NEEDS_PRICING"]
      if (draft && !ratesMatch(live, draft)) return [carId, "PUBLISHED_WITH_CHANGES"]
      return [carId, "PUBLISHED"]
    }),
  )
}
