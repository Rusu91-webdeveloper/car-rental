import { prisma } from "../lib/db"
import { createAuthoritativeBooking } from "../lib/pricing/prisma-booking-service"

async function main() {
  const latest = await prisma.booking.aggregate({
    where: { carId: "phase3-car" },
    _max: { dropoffDate: true },
  })
  const firstPickup = new Date((latest._max.dropoffDate?.getTime() ?? Date.UTC(2028, 0, 1)) + 86_400_000)
  const firstReturn = new Date(firstPickup.getTime() + 2 * 86_400_000)
  const secondPickup = new Date(firstPickup.getTime() + 86_400_000)
  const secondReturn = new Date(firstReturn.getTime() + 86_400_000)
  const suffix = Date.now().toString(36).toUpperCase()
  const bookingNumbers = [`P3-CONCURRENT-A-${suffix}`, `P3-CONCURRENT-B-${suffix}`]

  const common = {
    userId: "phase3-user",
    vehicleId: "phase3-car",
    pickupAt: firstPickup,
    returnAt: firstReturn,
    location: "Synthetic concurrency location",
    locale: "en" as const,
    paymentMethod: "TRANSFER" as const,
  }

  const outcomes = await Promise.allSettled([
    createAuthoritativeBooking(prisma, {
      ...common,
      bookingNumber: bookingNumbers[0],
      transferCode: `A${suffix}`,
    }),
    createAuthoritativeBooking(prisma, {
      ...common,
      pickupAt: secondPickup,
      returnAt: secondReturn,
      bookingNumber: bookingNumbers[1],
      transferCode: `B${suffix}`,
    }),
  ])

  const successful = outcomes.filter((outcome) => outcome.status === "fulfilled")
  const rejected = outcomes.filter((outcome) => outcome.status === "rejected")
  if (successful.length !== 1 || rejected.length !== 1) {
    throw new Error(`Expected one successful overlapping booking, received ${successful.length} success(es).`)
  }

  const persisted = await prisma.booking.findMany({
    where: { bookingNumber: { in: bookingNumbers } },
    include: { pricingSnapshot: true },
  })
  if (persisted.length !== 1 || !persisted[0].pricingSnapshot) {
    throw new Error("Concurrent booking winner and its pricing snapshot were not persisted atomically.")
  }
  if (persisted[0].totalPrice !== persisted[0].pricingSnapshot.grandTotal) {
    throw new Error("Booking total differs from its pricing snapshot.")
  }

  process.stdout.write(
    JSON.stringify({
      result: "phase3 booking concurrency verification passed",
      winner: persisted[0].bookingNumber,
      total: persisted[0].totalPrice,
      snapshot: persisted[0].pricingSnapshot.id,
    }),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
