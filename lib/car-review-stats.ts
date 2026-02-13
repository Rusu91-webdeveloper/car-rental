import { prisma } from "@/lib/db"

type CarReviewStats = {
  rating: number
  reviewCount: number
}

export async function getCarReviewStatsMap(carIds: string[]): Promise<Map<string, CarReviewStats>> {
  const uniqueCarIds = Array.from(new Set(carIds.filter(Boolean)))

  if (uniqueCarIds.length === 0) {
    return new Map()
  }

  const aggregates = await prisma.review.groupBy({
    by: ["carId"],
    where: {
      carId: {
        in: uniqueCarIds,
      },
    },
    _avg: {
      rating: true,
    },
    _count: {
      _all: true,
    },
  })

  return new Map(
    aggregates.map((item) => [
      item.carId,
      {
        rating: item._avg.rating ? Number(item._avg.rating.toFixed(1)) : 0,
        reviewCount: item._count._all,
      },
    ]),
  )
}

export function getCarReviewStats(map: Map<string, CarReviewStats>, carId: string): CarReviewStats {
  return map.get(carId) ?? { rating: 0, reviewCount: 0 }
}
