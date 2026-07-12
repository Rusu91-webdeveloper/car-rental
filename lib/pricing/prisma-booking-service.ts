import { Prisma, type PrismaClient } from "@prisma/client"
import { isCarAvailable } from "@/lib/availability"
import { PricingError } from "./errors"
import { PrismaPricingContextRepository } from "./prisma-repository"
import { quoteVehicleRental } from "./quote-service"
import { toBookingPricingSnapshotData } from "./snapshot"

export interface AuthoritativeBookingInput {
  userId: string
  vehicleId: string
  pickupAt: Date
  returnAt: Date
  location: string
  locale: "de" | "en"
  paymentMethod: "TRANSFER" | "PAY_AT_PICKUP"
  bookingNumber: string
  transferCode: string
}

export async function createAuthoritativeBooking(db: PrismaClient, input: AuthoritativeBookingInput) {
  try {
    return await db.$transaction(
      async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Car" WHERE id = ${input.vehicleId} FOR UPDATE`

      const car = await tx.car.findUnique({ where: { id: input.vehicleId } })
      if (!car || car.isDeleted) throw new Error("Car not found")
      if (car.status === "RENTED" || car.status === "MAINTENANCE") {
        throw new Error("Car is not available for booking")
      }
      const stillAvailable = await isCarAvailable(input.vehicleId, input.pickupAt, input.returnAt, undefined, tx)
      if (!stillAvailable) throw new Error("Car is no longer available")

      const quote = await quoteVehicleRental(new PrismaPricingContextRepository(tx), {
        vehicleId: input.vehicleId,
        pickupAt: input.pickupAt,
        returnAt: input.returnAt,
        paymentMethod: input.paymentMethod,
      })
      const booking = await tx.booking.create({
        data: {
          userId: input.userId,
          carId: input.vehicleId,
          locale: input.locale,
          pickupDate: input.pickupAt,
          dropoffDate: input.returnAt,
          location: input.location,
          pricePerDay: quote.sourceDailyRate,
          totalDays: quote.chargeableDuration.chargeableDays,
          totalPrice: quote.grandTotal,
          depositAmount: quote.payment.depositAmount,
          guaranteeAmount: quote.payment.guaranteeAmount,
          transferCode: input.transferCode,
          bookingNumber: input.bookingNumber,
          status: "PENDING",
          paymentStatus: "PENDING",
          paymentMethod: input.paymentMethod,
        },
      })

      const snapshot = toBookingPricingSnapshotData(booking.id, quote)
      try {
        await tx.bookingPricingSnapshot.create({
          data: {
            ...snapshot,
            calculationTrace: snapshot.calculationTrace as unknown as Prisma.InputJsonValue,
          },
        })
      } catch (error) {
        console.error("[BOOKING_PRICING_SNAPSHOT_ERROR]", { bookingId: booking.id, error })
        throw new PricingError(
          "SNAPSHOT_PERSISTENCE_FAILED",
          "Booking pricing snapshot could not be persisted.",
          "OPERATIONAL",
        )
      }

        return { booking, quote }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new Error("Car is no longer available")
    }
    throw error
  }
}
