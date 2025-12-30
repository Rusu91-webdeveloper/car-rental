"use server"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export async function getAdminStats() {
  try {
    await requireAdmin()

    const [totalBookings, totalCars, totalUsers, totalRevenue, recentBookings] = await Promise.all([
      prisma.booking.count(),
      prisma.car.count({ where: { isDeleted: false } }),
      prisma.user.count(),
      prisma.booking.aggregate({
        where: { paymentStatus: "PAID" },
        _sum: { totalPrice: true },
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
        totalRevenue: totalRevenue._sum.totalPrice || 0,
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

    const bookings = await prisma.booking.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        car: { select: { id: true, name: true, image: true, category: true } },
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
