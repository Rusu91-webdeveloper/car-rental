import { PrismaClient, type CarCategory, type CarStatus } from "@prisma/client"
import { normalizeDatabaseUrl } from "../lib/db-url"

// Normalize database URL before creating PrismaClient
normalizeDatabaseUrl()

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: "admin@rentcar.com" },
    update: {},
    create: {
      providerId: "seed_admin",
      email: "admin@rentcar.com",
      name: "Admin User",
      role: "ADMIN",
    },
  })

  console.log("✅ Created admin user:", admin.email)

  // Create test user
  const testUser = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: {
      providerId: "seed_user",
      email: "test@example.com",
      name: "Test User",
      role: "USER",
    },
  })

  console.log("✅ Created test user:", testUser.email)

  // Create cars
  const cars = [
    {
      slug: "tesla-model-3",
      name: "Tesla Model 3",
      nameDe: "Tesla Model 3",
      subtitle: "Long Range • 2023",
      subtitleDe: "Long Range • 2023",
      description:
        "Experience the future of driving with the Tesla Model 3. This fully electric sedan combines minimalist design with maximum performance. Featuring Autopilot capabilities, a glass roof, and a premium interior, it delivers a smooth, silent, and exhilarating ride perfect for both city commutes and long highway trips.",
      descriptionDe:
        "Erleben Sie die Zukunft des Fahrens mit dem Tesla Model 3. Diese vollelektrische Limousine kombiniert minimalistisches Design mit maximaler Leistung. Mit Autopilot-Funktionen, Glasdach und Premium-Innenausstattung bietet sie eine sanfte, geräuschlose und aufregende Fahrt, perfekt für Stadtfahrten und lange Autobahnfahrten.",
      category: "ELECTRIC" as CarCategory,
      price: 8500, // $85.00 per day in cents
      image: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800",
      status: "AVAILABLE" as CarStatus,
      gearbox: "Automatic",
      seats: 5,
      fuelType: "Electric",
      acceleration: "3.1sec",
      year: 2023,
      rating: 4.9,
      reviewCount: 128,
    },
    {
      slug: "bmw-3-series",
      name: "BMW 3 Series",
      nameDe: "BMW 3er",
      subtitle: "Sport Line • 2023",
      subtitleDe: "Sport Line • 2023",
      description:
        "The BMW 3 Series delivers the perfect blend of luxury and performance. With its sporty handling, premium interior materials, and advanced technology features, this sedan offers an exceptional driving experience.",
      descriptionDe:
        "Die BMW 3er Serie bietet die perfekte Mischung aus Luxus und Leistung. Mit sportlichem Handling, hochwertigen Innenraummaterialien und modernster Technologie bietet diese Limousine ein außergewöhnliches Fahrerlebnis.",
      category: "LUXURY" as CarCategory,
      price: 12000,
      image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800",
      status: "AVAILABLE" as CarStatus,
      gearbox: "Automatic",
      seats: 5,
      fuelType: "Gas",
      acceleration: "5.6sec",
      year: 2023,
      rating: 4.7,
      reviewCount: 89,
    },
    {
      slug: "toyota-rav4",
      name: "Toyota RAV4",
      nameDe: "Toyota RAV4",
      subtitle: "Hybrid • 2023",
      subtitleDe: "Hybrid • 2023",
      description:
        "The Toyota RAV4 Hybrid combines fuel efficiency with SUV versatility. Perfect for families and adventure seekers, it offers spacious cargo room, advanced safety features, and reliable performance.",
      descriptionDe:
        "Der Toyota RAV4 Hybrid kombiniert Kraftstoffeffizienz mit SUV-Vielseitigkeit. Perfekt für Familien und Abenteuerlustige bietet er geräumigen Stauraum, fortschrittliche Sicherheitsfeatures und zuverlässige Leistung.",
      category: "SUV" as CarCategory,
      price: 7500,
      image: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800",
      status: "LOW_STOCK" as CarStatus,
      gearbox: "Automatic",
      seats: 5,
      fuelType: "Hybrid",
      acceleration: "7.8sec",
      year: 2023,
      rating: 4.5,
      reviewCount: 156,
    },
    {
      slug: "audi-a4",
      name: "Audi A4",
      nameDe: "Audi A4",
      subtitle: "Premium Plus • 2023",
      subtitleDe: "Premium Plus • 2023",
      description:
        "The Audi A4 brings sophisticated German engineering and luxury appointments to the compact sedan segment. With its refined interior and smooth ride quality, it's perfect for business and leisure travel.",
      descriptionDe:
        "Der Audi A4 bringt anspruchsvolles deutsches Engineering und luxuriöse Ausstattung in die Kompaktlimousinenklasse. Mit seinem raffinierten Innenraum und sanften Fahrkomfort ist er perfekt für Geschäfts- und Freizeitreisen.",
      category: "SEDAN" as CarCategory,
      price: 9500,
      image: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800",
      status: "AVAILABLE" as CarStatus,
      gearbox: "Automatic",
      seats: 5,
      fuelType: "Gas",
      acceleration: "5.9sec",
      year: 2023,
      rating: 4.6,
      reviewCount: 72,
    },
    {
      slug: "mercedes-benz-glc",
      name: "Mercedes-Benz GLC",
      nameDe: "Mercedes-Benz GLC",
      subtitle: "AMG Line • 2023",
      subtitleDe: "AMG Line • 2023",
      description:
        "The Mercedes-Benz GLC offers premium luxury in a versatile SUV package. With cutting-edge technology, refined comfort, and impressive performance, it's the perfect choice for those who demand excellence.",
      descriptionDe:
        "Der Mercedes-Benz GLC bietet Premium-Luxus in einem vielseitigen SUV-Paket. Mit modernster Technologie, raffiniertem Komfort und beeindruckender Leistung ist er die perfekte Wahl für alle, die Exzellenz fordern.",
      category: "LUXURY" as CarCategory,
      price: 13500,
      image: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800",
      status: "AVAILABLE" as CarStatus,
      gearbox: "Automatic",
      seats: 5,
      fuelType: "Gas",
      acceleration: "6.2sec",
      year: 2023,
      rating: 4.8,
      reviewCount: 94,
    },
    {
      slug: "hyundai-ioniq-5",
      name: "Hyundai Ioniq 5",
      nameDe: "Hyundai Ioniq 5",
      subtitle: "AWD • 2024",
      subtitleDe: "AWD • 2024",
      description:
        "The Hyundai Ioniq 5 blends bold design with fast charging and roomy comfort. Its futuristic cabin, wide stance, and smooth electric power make it a standout choice for modern city and highway travel.",
      descriptionDe:
        "Der Hyundai Ioniq 5 verbindet mutiges Design mit schnellem Laden und viel Platz. Seine futuristische Kabine, die breite Spur und die leise E-Power machen ihn ideal fuer Stadt und Autobahn.",
      category: "ELECTRIC" as CarCategory,
      price: 9000,
      image: "https://images.unsplash.com/photo-1628519597639-0c1b7a2d78a5?w=800",
      status: "AVAILABLE" as CarStatus,
      gearbox: "Automatic",
      seats: 5,
      fuelType: "Electric",
      acceleration: "5.2sec",
      year: 2024,
      rating: 4.6,
      reviewCount: 64,
    },
    {
      slug: "range-rover-evoque",
      name: "Range Rover Evoque",
      nameDe: "Range Rover Evoque",
      subtitle: "R-Dynamic • 2023",
      subtitleDe: "R-Dynamic • 2023",
      description:
        "The Range Rover Evoque brings premium design to a compact SUV. With refined materials, confident handling, and a commanding driving position, it is perfect for urban luxury.",
      descriptionDe:
        "Der Range Rover Evoque bringt Premium-Design in ein kompaktes SUV. Hochwertige Materialien, sicheres Handling und eine erhoehte Sitzposition sorgen fuer urbanen Luxus.",
      category: "SUV" as CarCategory,
      price: 11000,
      image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
      status: "AVAILABLE" as CarStatus,
      gearbox: "Automatic",
      seats: 5,
      fuelType: "Gas",
      acceleration: "7.0sec",
      year: 2023,
      rating: 4.7,
      reviewCount: 58,
    },
    {
      slug: "volkswagen-golf",
      name: "Volkswagen Golf",
      nameDe: "Volkswagen Golf",
      subtitle: "TSI • 2022",
      subtitleDe: "TSI • 2022",
      description:
        "The Volkswagen Golf is a practical hatchback with solid efficiency and a refined ride. Ideal for daily driving, it offers a clean layout, easy handling, and strong value.",
      descriptionDe:
        "Der Volkswagen Golf ist ein praktischer Kompaktwagen mit guter Effizienz und ruhigem Fahrverhalten. Perfekt fuer den Alltag, mit uebersichtlichem Innenraum und sicherem Handling.",
      category: "SEDAN" as CarCategory,
      price: 5200,
      image: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800",
      status: "AVAILABLE" as CarStatus,
      gearbox: "Automatic",
      seats: 5,
      fuelType: "Gas",
      acceleration: "8.1sec",
      year: 2022,
      rating: 4.3,
      reviewCount: 112,
    },
    {
      slug: "ford-mustang-gt",
      name: "Ford Mustang GT",
      nameDe: "Ford Mustang GT",
      subtitle: "V8 • 2023",
      subtitleDe: "V8 • 2023",
      description:
        "The Ford Mustang GT delivers classic muscle with modern tech. A powerful V8, bold styling, and an engaging drive make it a thrilling rental for weekend escapes.",
      descriptionDe:
        "Der Ford Mustang GT bietet klassischen Muscle-Car-Charme mit moderner Technik. Ein kraftvoller V8, markantes Design und ein sportliches Fahrgefuehl sorgen fuer Spass am Wochenende.",
      category: "LUXURY" as CarCategory,
      price: 14000,
      image: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=800",
      status: "LOW_STOCK" as CarStatus,
      gearbox: "Manual",
      seats: 4,
      fuelType: "Gas",
      acceleration: "4.2sec",
      year: 2023,
      rating: 4.8,
      reviewCount: 37,
    },
    {
      slug: "porsche-911-carrera",
      name: "Porsche 911 Carrera",
      nameDe: "Porsche 911 Carrera",
      subtitle: "Sport Chrono • 2022",
      subtitleDe: "Sport Chrono • 2022",
      description:
        "The Porsche 911 Carrera is a timeless sports car with razor-sharp handling and a premium interior. It offers an iconic driving feel for special occasions.",
      descriptionDe:
        "Der Porsche 911 Carrera ist ein zeitloser Sportwagen mit praezisem Handling und hochwertigem Innenraum. Er bietet ein ikonisches Fahrerlebnis fuer besondere Anlaesse.",
      category: "LUXURY" as CarCategory,
      price: 22000,
      image: "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?w=800",
      status: "AVAILABLE" as CarStatus,
      gearbox: "Automatic",
      seats: 2,
      fuelType: "Gas",
      acceleration: "3.9sec",
      year: 2022,
      rating: 4.9,
      reviewCount: 41,
    },
  ]

  for (const car of cars) {
    const created = await prisma.car.upsert({
      where: { slug: car.slug },
      update: {},
      create: car,
    })
    console.log("✅ Created car:", created.name)
  }

  console.log("✨ Database seeded successfully!")
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
