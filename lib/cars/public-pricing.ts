import "server-only"

import type { Prisma, PrismaClient } from "@prisma/client"

type DbClient = PrismaClient | Prisma.TransactionClient

export interface PublicCarPrice {
  price: number | null
  pricingPublished: boolean
}

function hasValidPublishedLifecycle(release: {
  validationStatus: string
  pricingBillingConfig: { version: { status: string; validationStatus: string } }
  fleetRateSet: { status: string; validationStatus: string }
}): boolean {
  const valid = (status: string) => status === "VALID" || status === "WARNING"

  return (
    valid(release.validationStatus) &&
    release.pricingBillingConfig.version.status === "RELEASED" &&
    valid(release.pricingBillingConfig.version.validationStatus) &&
    release.fleetRateSet.status === "RELEASED" &&
    valid(release.fleetRateSet.validationStatus)
  )
}

/**
 * Returns the exact daily prices customers may book with.
 * When versioned pricing is active, legacy Car.price values are intentionally
 * ignored so the catalog cannot advertise a draft or unpublished rate.
 */
export async function getPublicCarPrices(
  db: DbClient,
  cars: Array<{ id: string; price: number }>,
): Promise<Map<string, PublicCarPrice>> {
  if (cars.length === 0) return new Map()

  const activeRelease = await db.businessConfigurationRelease.findFirst({
    where: { status: "ACTIVE" },
    select: {
      validationStatus: true,
      pricingBillingConfig: {
        select: { version: { select: { status: true, validationStatus: true } } },
      },
      fleetRateSet: {
        select: {
          status: true,
          validationStatus: true,
          rates: {
            where: { carId: { in: cars.map(({ id }) => id) } },
            select: { carId: true, dailyRate: true },
          },
        },
      },
    },
  })

  if (!activeRelease) {
    return new Map(
      cars.map((car) => [
        car.id,
        { price: car.price, pricingPublished: car.price > 0 },
      ]),
    )
  }

  if (!hasValidPublishedLifecycle(activeRelease)) {
    return new Map(cars.map((car) => [car.id, { price: null, pricingPublished: false }]))
  }

  const publishedRates = new Map(
    activeRelease.fleetRateSet.rates.map((rate) => [rate.carId, rate.dailyRate]),
  )

  return new Map(
    cars.map((car) => {
      const price = publishedRates.get(car.id)
      return [
        car.id,
        price !== undefined && price > 0
          ? { price, pricingPublished: true }
          : { price: null, pricingPublished: false },
      ]
    }),
  )
}
