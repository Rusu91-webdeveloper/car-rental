"use server"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { runBookingLifecycleMaintenance } from "@/lib/booking-expiration"
import { revalidatePath } from "next/cache"
import { createAdminUserSchema, setUserActiveStatusSchema } from "@/lib/validations"
import { isCarAvailable } from "@/lib/availability"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import {
  hasMinimumPickupLeadTime,
  isHandoverTimeAllowed,
  normalizeHandoverPolicy,
  normalizeOpeningHoursExceptions,
  normalizeWeeklyOpeningHours,
} from "@/lib/business-hours"
import { evaluateRentalHandoverCapacity } from "@/lib/handover-capacity"
import { isCarLifecycleBookable } from "@/lib/booking-applications/domain"
import { isRentalDurationTooShort } from "@/lib/booking-configuration/minimum-rental"

const MANUAL_RESERVATION_PREFIX = "manual_reservation::"

const createManualReservationSchema = z
  .object({
    carId: z.string().min(1),
    customerName: z.string().trim().min(2, "Customer name is required").max(120),
    customerPhone: z
      .string()
      .trim()
      .min(6, "Phone number is required")
      .max(40, "Phone number is too long")
      .regex(/^[0-9+\s()\-/.]+$/, "Please enter a valid phone number"),
    pickupDate: z.string().datetime(),
    dropoffDate: z.string().datetime(),
    totalPrice: z.number().int().min(0, "Price must be 0 or greater"),
  })
  .refine(
    (value) => {
      const pickup = new Date(value.pickupDate)
      const dropoff = new Date(value.dropoffDate)
      return dropoff > pickup
    },
    {
      message: "Drop-off date must be after pickup date",
      path: ["dropoffDate"],
    },
  )
  .refine(
    (value) => {
      const pickup = new Date(value.pickupDate)
      return pickup > new Date()
    },
    {
      message: "Pickup date must be in the future",
      path: ["pickupDate"],
    },
  )

const encodeManualReservationReason = (data: { customerName: string; customerPhone: string; totalPrice: number }) =>
  `${MANUAL_RESERVATION_PREFIX}${JSON.stringify(data)}`

const isManualReservationReason = (reason: string | null): boolean =>
  typeof reason === "string" && reason.startsWith(MANUAL_RESERVATION_PREFIX)

export async function getAdminStats() {
  try {
    await requireAdmin()
    await runBookingLifecycleMaintenance()

    const [totalBookings, totalCars, totalUsers, receivedRevenue, refundedRevenue, recentBookings] = await Promise.all([
      prisma.booking.count(),
      prisma.car.count({ where: { isDeleted: false } }),
      prisma.user.count(),
      prisma.payment.aggregate({
        where: { status: "PAID", kind: "RECEIPT" },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: "REFUNDED", kind: "REFUND" },
        _sum: { amount: true },
      }),
      prisma.booking.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
          car: { select: { name: true, image: true } },
        },
      }),
    ])

    const bookingsByStatus = await prisma.booking.groupBy({
      by: ["status"],
      _count: { status: true },
    })

    return {
      stats: {
        totalBookings,
        totalCars,
        totalUsers,
        totalRevenue: (receivedRevenue._sum.amount || 0) - (refundedRevenue._sum.amount || 0),
      },
      bookingsByStatus,
      recentBookings,
    }
  } catch (error) {
    console.error("[GET_ADMIN_STATS_ERROR]", error)
    return { error: "Failed to fetch admin stats" }
  }
}

export async function getAllBookings() {
  try {
    await requireAdmin()
    await runBookingLifecycleMaintenance()

    const bookings = await prisma.booking.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        car: { select: { id: true, name: true, image: true, category: true } },
        pricingSnapshot: true,
      },
      orderBy: { createdAt: "desc" },
    })

    return { bookings }
  } catch (error) {
    console.error("[GET_ALL_BOOKINGS_ERROR]", error)
    return { error: "Failed to fetch bookings" }
  }
}

export async function getAllCars() {
  try {
    await requireAdmin()

    const cars = await prisma.car.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: "desc" },
    })

    return { cars }
  } catch (error) {
    console.error("[GET_ALL_CARS_ERROR]", error)
    return { error: "Failed to fetch cars" }
  }
}

export async function getAllUsers() {
  try {
    await requireAdmin()

    const users = await prisma.user.findMany({
      include: {
        _count: {
          select: { bookings: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return { users }
  } catch (error) {
    console.error("[GET_ALL_USERS_ERROR]", error)
    return { error: "Failed to fetch users" }
  }
}

export async function createAdminUser(data: unknown) {
  try {
    const admin = await requireAdmin()
    const validated = createAdminUserSchema.parse(data)

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: validated.email,
          mode: "insensitive",
        },
      },
      select: { id: true },
    })

    if (existingUser) {
      return { error: "A user with this email already exists" }
    }

    const user = await prisma.user.create({
      data: {
        name: validated.name,
        email: validated.email,
        role: validated.role,
        isActive: true,
      },
    })

    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "USER_ROLE_CHANGED",
        targetType: "user",
        targetId: user.id,
        reason: "user_created",
        newValue: {
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      },
    })

    revalidatePath("/admin")

    return { success: true, user }
  } catch (error) {
    console.error("[CREATE_ADMIN_USER_ERROR]", error)

    if (error instanceof z.ZodError) {
      return { error: error.errors[0]?.message || "Invalid user data" }
    }

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to create user" }
  }
}

export async function setUserActiveState(data: unknown) {
  try {
    const admin = await requireAdmin()
    const validated = setUserActiveStatusSchema.parse(data)

    const targetUser = await prisma.user.findUnique({
      where: { id: validated.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })

    if (!targetUser) {
      return { error: "User not found" }
    }

    if (targetUser.id === admin.id) {
      return { error: "You cannot deactivate your own account" }
    }

    if (targetUser.isActive === validated.isActive) {
      return { success: true, user: targetUser }
    }

    if (!validated.isActive && targetUser.role === "ADMIN") {
      const activeAdminCount = await prisma.user.count({
        where: {
          role: "ADMIN",
          isActive: true,
        },
      })

      if (activeAdminCount <= 1) {
        return { error: "Cannot deactivate the last active admin" }
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: validated.userId },
      data: {
        isActive: validated.isActive,
        deactivatedAt: validated.isActive ? null : new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })

    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "USER_ROLE_CHANGED",
        targetType: "user",
        targetId: updatedUser.id,
        reason: validated.isActive ? "user_reactivated" : "user_deactivated",
        oldValue: { isActive: targetUser.isActive },
        newValue: { isActive: updatedUser.isActive },
      },
    })

    revalidatePath("/admin")

    return { success: true, user: updatedUser }
  } catch (error) {
    console.error("[SET_USER_ACTIVE_STATE_ERROR]", error)

    if (error instanceof z.ZodError) {
      return { error: error.errors[0]?.message || "Invalid user state payload" }
    }

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to update user status" }
  }
}

export async function deleteAdminUser(userId: string) {
  try {
    const admin = await requireAdmin()

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    })

    if (!targetUser) {
      return { error: "User not found" }
    }

    if (targetUser.id === admin.id) {
      return { error: "You cannot delete your own account" }
    }

    if (targetUser.role === "ADMIN" && targetUser.isActive) {
      const activeAdminCount = await prisma.user.count({
        where: {
          role: "ADMIN",
          isActive: true,
        },
      })

      if (activeAdminCount <= 1) {
        return { error: "Cannot delete the last active admin" }
      }
    }

    if (targetUser._count.bookings > 0) {
      return { error: "Cannot delete users with bookings. Deactivate this user instead." }
    }

    await prisma.$transaction(async (tx) => {
      await tx.savedCar.deleteMany({
        where: { userId },
      })

      await tx.adminAuditLog.deleteMany({
        where: { adminId: userId },
      })

      await tx.user.delete({
        where: { id: userId },
      })

      await tx.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "USER_ROLE_CHANGED",
          targetType: "user",
          targetId: userId,
          reason: "user_deleted",
          oldValue: {
            name: targetUser.name,
            email: targetUser.email,
            role: targetUser.role,
            isActive: targetUser.isActive,
          },
        },
      })
    })

    revalidatePath("/admin")

    return { success: true }
  } catch (error) {
    console.error("[DELETE_ADMIN_USER_ERROR]", error)

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to delete user" }
  }
}

export async function createManualReservation(data: unknown) {
  try {
    const admin = await requireAdmin()
    await runBookingLifecycleMaintenance()
    const validated = createManualReservationSchema.parse(data)

    const pickupDate = new Date(validated.pickupDate)
    const dropoffDate = new Date(validated.dropoffDate)

    const [car, activeRelease] = await Promise.all([
      prisma.car.findUnique({
        where: { id: validated.carId },
        select: { id: true, name: true, isDeleted: true, status: true },
      }),
      prisma.businessConfigurationRelease.findFirst({
        where: { status: "ACTIVE" },
        select: {
          generalRentalConfig: { select: {
            businessTimeZone: true,
            weeklyOpeningHours: true,
            openingHoursExceptions: true,
            handoverPolicy: true,
          } },
          pricingBillingConfig: { select: { minimumRentalMinutes: true } },
        },
      }),
    ])

    if (!car || !isCarLifecycleBookable(car)) {
      return { error: "Car is not currently bookable" }
    }
    if (!activeRelease) return { error: "Active booking configuration not found" }
    const weeklyOpeningHours = normalizeWeeklyOpeningHours(activeRelease.generalRentalConfig.weeklyOpeningHours)
    const exceptions = normalizeOpeningHoursExceptions(activeRelease.generalRentalConfig.openingHoursExceptions)
    const handoverPolicy = normalizeHandoverPolicy(activeRelease.generalRentalConfig.handoverPolicy)
    if (!isHandoverTimeAllowed(pickupDate, activeRelease.generalRentalConfig.businessTimeZone, weeklyOpeningHours, exceptions, handoverPolicy, "PICKUP"))
      return { error: "Pick-up must be during the configured pickup windows" }
    if (!isHandoverTimeAllowed(dropoffDate, activeRelease.generalRentalConfig.businessTimeZone, weeklyOpeningHours, exceptions, handoverPolicy, "RETURN"))
      return { error: "Return must be during the configured return windows" }
    if (!hasMinimumPickupLeadTime(pickupDate, handoverPolicy))
      return { error: "Pick-up does not meet the configured minimum booking notice" }
    if (isRentalDurationTooShort(pickupDate, dropoffDate, activeRelease.pricingBillingConfig.minimumRentalMinutes))
      return { error: "The reservation is shorter than the configured minimum rental period" }

    const reservationReason = encodeManualReservationReason({
      customerName: validated.customerName,
      customerPhone: validated.customerPhone,
      totalPrice: validated.totalPrice,
    })

    const blockedDate = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Car" WHERE id = ${validated.carId} FOR UPDATE`
        const lockedCar = await tx.car.findUnique({
          where: { id: validated.carId },
          select: { isDeleted: true, status: true },
        })
        if (!lockedCar || !isCarLifecycleBookable(lockedCar)) {
          throw new Error("Car is not currently bookable")
        }
        const stillAvailable = await isCarAvailable(validated.carId, pickupDate, dropoffDate, { db: tx })

        if (!stillAvailable) {
          throw new Error("Car is not available for the selected date range")
        }

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026072821)`
        const capacity = await evaluateRentalHandoverCapacity({ db: tx, pickupAt: pickupDate, returnAt: dropoffDate, policy: handoverPolicy })
        if (!capacity.pickupAvailable) throw new Error("The selected pick-up slot has reached its handover capacity")
        if (!capacity.returnAvailable) throw new Error("The selected return slot has reached its handover capacity")

        const createdBlockedDate = await tx.blockedDate.create({
          data: {
            carId: validated.carId,
            startDate: pickupDate,
            endDate: dropoffDate,
            reason: reservationReason,
          },
        })

        await tx.adminAuditLog.create({
          data: {
            adminId: admin.id,
            action: "BLOCKED_DATE_ADDED",
            targetType: "car",
            targetId: validated.carId,
            reason: "manual_reservation_created",
            newValue: {
              blockedDateId: createdBlockedDate.id,
              customerName: validated.customerName,
              customerPhone: validated.customerPhone,
              totalPrice: validated.totalPrice,
              pickupDate: pickupDate.toISOString(),
              dropoffDate: dropoffDate.toISOString(),
            },
          },
        })

        return createdBlockedDate
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    )

    revalidatePath("/admin")
    revalidatePath("/")
    revalidatePath(`/cars/${validated.carId}`)

    return {
      success: true,
      reservation: {
        id: blockedDate.id,
        carId: blockedDate.carId,
        customerName: validated.customerName,
        customerPhone: validated.customerPhone,
        totalPrice: validated.totalPrice,
        pickupDate: blockedDate.startDate.toISOString(),
        dropoffDate: blockedDate.endDate.toISOString(),
        createdAt: blockedDate.createdAt.toISOString(),
      },
    }
  } catch (error) {
    console.error("[CREATE_MANUAL_RESERVATION_ERROR]", error)

    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message || "Invalid reservation data" }
    }

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to create manual reservation" }
  }
}

export async function deleteManualReservation(blockedDateId: string) {
  try {
    const admin = await requireAdmin()

    const blockedDate = await prisma.blockedDate.findUnique({
      where: { id: blockedDateId },
      select: {
        id: true,
        carId: true,
        startDate: true,
        endDate: true,
        reason: true,
      },
    })

    if (!blockedDate) {
      return { error: "Reservation not found" }
    }

    if (!isManualReservationReason(blockedDate.reason)) {
      return { error: "Only manual reservations can be removed from this section" }
    }

    await prisma.$transaction(async (tx) => {
      await tx.blockedDate.delete({
        where: { id: blockedDateId },
      })

      await tx.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "BLOCKED_DATE_REMOVED",
          targetType: "car",
          targetId: blockedDate.carId,
          reason: "manual_reservation_removed",
          oldValue: {
            blockedDateId: blockedDate.id,
            pickupDate: blockedDate.startDate.toISOString(),
            dropoffDate: blockedDate.endDate.toISOString(),
            rawReason: blockedDate.reason,
          },
        },
      })
    })

    revalidatePath("/admin")
    revalidatePath("/")
    revalidatePath(`/cars/${blockedDate.carId}`)

    return { success: true }
  } catch (error) {
    console.error("[DELETE_MANUAL_RESERVATION_ERROR]", error)

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to remove manual reservation" }
  }
}

export async function getAuditLogs(limit = 50) {
  try {
    await requireAdmin()

    const logs = await prisma.adminAuditLog.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        admin: { select: { name: true, email: true } },
      },
    })

    return { logs }
  } catch (error) {
    console.error("[GET_AUDIT_LOGS_ERROR]", error)
    return { error: "Failed to fetch audit logs" }
  }
}
