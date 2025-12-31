import createNextIntlPlugin from "next-intl/plugin"

// Normalize database URL early in the build process
// This ensures CAR_DATABASE_URL is available as DATABASE_URL for Prisma
if (!process.env.DATABASE_URL && process.env.CAR_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.CAR_DATABASE_URL
}

const withNextIntl = createNextIntlPlugin("./i18n.ts")

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
}

export default withNextIntl(nextConfig)
