"use server"

import { revalidatePath } from "next/cache"
import { Prisma, type Booking } from "@prisma/client"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createBookingReviewSchema } from "@/lib/validations"
import { z } from "zod"

const canReviewBooking = (booking: Pick<Booking, "status" | "paymentStatus" | "paymentMethod">) => {
  return booking.status === "COMPLETED" && (booking.paymentStatus === "PAID" || booking.paymentMethod === "PAY_AT_PICKUP")
}

async function syncCarRatingStats(tx: Prisma.TransactionClient, carId: string) {
  const aggregates = await tx.review.aggregate({
    where: { carId },
    _avg: { rating: true },
    _count: { rating: true },
  })

  const averageRating = aggregates._avg.rating ? Number(aggregates._avg.rating.toFixed(1)) : 0
  const reviewCount = aggregates._count.rating ?? 0

  await tx.car.update({
    where: { id: carId },
    data: {
      rating: averageRating,
      reviewCount,
    },
  })
}

export async function createBookingReview(data: unknown) {
  try {
    const user = await requireAuth()
    const validated = createBookingReviewSchema.parse(data)

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: validated.bookingId },
        include: { review: true },
      })

      if (!booking) {
        throw new Error("Booking not found")
      }

      if (booking.userId !== user.id) {
        throw new Error("You can only review your own bookings")
      }

      if (!canReviewBooking(booking)) {
        throw new Error("Only completed and paid bookings can be reviewed")
      }

      if (booking.review) {
        throw new Error("You already left a review for this booking")
      }

      const review = await tx.review.create({
        data: {
          bookingId: booking.id,
          userId: user.id,
          carId: booking.carId,
          rating: validated.rating,
          comment: validated.comment.trim(),
        },
      })

      await syncCarRatingStats(tx, booking.carId)

      return {
        review,
        carId: booking.carId,
      }
    })

    revalidatePath("/bookings")
    revalidatePath("/cars")
    revalidatePath(`/cars/${result.carId}`)

    return {
      success: true,
      review: {
        id: result.review.id,
        rating: result.review.rating,
        comment: result.review.comment,
        createdAt: result.review.createdAt.toISOString(),
      },
    }
  } catch (error) {
    console.error("[CREATE_BOOKING_REVIEW_ERROR]", error)

    if (error instanceof z.ZodError) {
      const issue = error.issues[0]
      return { error: issue?.message || "Please provide a star rating and comment." }
    }

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to save review" }
  }
}
