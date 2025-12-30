import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function updateExistingCarsYear() {
  console.log("🔄 Updating existing cars with default year...")

  try {
    // Get all cars without a year
    const carsWithoutYear = await prisma.car.findMany({
      where: {
        year: null,
      },
    })

    if (carsWithoutYear.length === 0) {
      console.log("✅ All cars already have a year assigned")
      return
    }

    // Set default year to 2023 (or extract from subtitle if available)
    const currentYear = new Date().getFullYear()
    let updated = 0

    for (const car of carsWithoutYear) {
      // Try to extract year from subtitle (e.g., "Long Range • 2023")
      let yearToSet = currentYear
      if (car.subtitle) {
        const yearMatch = car.subtitle.match(/\b(20\d{2})\b/)
        if (yearMatch) {
          yearToSet = parseInt(yearMatch[1], 10)
        }
      }

      await prisma.car.update({
        where: { id: car.id },
        data: { year: yearToSet },
      })

      updated++
      console.log(`✅ Updated ${car.name} with year ${yearToSet}`)
    }

    console.log(`✨ Updated ${updated} cars with year values`)
  } catch (error) {
    console.error("❌ Error updating cars:", error)
    throw error
  }
}

updateExistingCarsYear()
  .catch((e) => {
    console.error("❌ Update failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

