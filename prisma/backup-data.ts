import { PrismaClient } from "@prisma/client"
import { writeFileSync } from "fs"
import { join } from "path"
import { normalizeDatabaseUrl } from "../lib/db-url"

// Normalize database URL before creating PrismaClient
normalizeDatabaseUrl()

const prisma = new PrismaClient()

async function backupData() {
  console.log("📦 Backing up database data...")

  try {
    // Backup users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        providerId: true,
        email: true,
        name: true,
        role: true,
        stripeCustomerId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Backup cars
    const cars = await prisma.car.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        nameDe: true,
        subtitle: true,
        subtitleDe: true,
        description: true,
        descriptionDe: true,
        category: true,
        price: true,
        image: true,
        images: true,
        status: true,
        gearbox: true,
        seats: true,
        fuelType: true,
        acceleration: true,
        rating: true,
        reviewCount: true,
        isDeleted: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Backup bookings
    const bookings = await prisma.booking.findMany({
      select: {
        id: true,
        bookingNumber: true,
        transferCode: true,
        userId: true,
        carId: true,
        pickupDate: true,
        dropoffDate: true,
        location: true,
        pricePerDay: true,
        totalDays: true,
        totalPrice: true,
        depositAmount: true,
        status: true,
        paymentStatus: true,
        stripeSessionId: true,
        stripePaymentIntentId: true,
        createdAt: true,
        updatedAt: true,
        confirmedAt: true,
        cancelledAt: true,
        completedAt: true,
      },
    })

    // Backup saved cars
    const savedCars = await prisma.savedCar.findMany({
      select: {
        id: true,
        userId: true,
        carId: true,
        createdAt: true,
      },
    })

    const backup = {
      timestamp: new Date().toISOString(),
      users,
      cars,
      bookings,
      savedCars,
    }

    const backupPath = join(process.cwd(), "prisma", "backup.json")
    writeFileSync(backupPath, JSON.stringify(backup, null, 2))

    console.log(`✅ Backup created at: ${backupPath}`)
    console.log(`   - ${users.length} users`)
    console.log(`   - ${cars.length} cars`)
    console.log(`   - ${bookings.length} bookings`)
    console.log(`   - ${savedCars.length} saved cars`)
  } catch (error) {
    console.error("❌ Error backing up data:", error)
    throw error
  }
}

backupData()
  .catch((e) => {
    console.error("❌ Backup failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
