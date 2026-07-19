import createNextIntlPlugin from "next-intl/plugin"

// Normalize database URL early in the build process
// This ensures CAR_DATABASE_URL is available as DATABASE_URL for Prisma
if (!process.env.DATABASE_URL && process.env.CAR_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.CAR_DATABASE_URL
}

const withNextIntl = createNextIntlPlugin("./i18n.ts")

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  async redirects() {
    const routes = {
      overview: "advanced/configuration",
      pricing: "cars/pricing",
      billing: "bookings/settings/duration",
      insurance: "bookings/settings/insurance",
      "driver-requirements": "bookings/driver-rules",
      "customer-information": "customers/settings",
      "booking-flow": "bookings/settings/flow",
      documents: "documents/settings",
      payments: "payments",
      confirmations: "settings/notifications",
      legal: "settings/legal",
      advanced: "advanced/configuration",
    }
    return [
      {
        source: "/:locale/admin/business-configuration",
        destination: "/:locale/admin/settings",
        permanent: false,
      },
      ...Object.entries(routes).map(([source, destination]) => ({
        source: `/:locale/admin/business-configuration/${source}`,
        destination: `/:locale/admin/${destination}`,
        permanent: false,
      })),
      {
        source: "/:locale/admin/business-configuration/:section",
        destination: "/:locale/admin/settings",
        permanent: false,
      },
    ]
  },
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ]
    if (process.env.NODE_ENV === "production")
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      })
    return [{ source: "/(.*)", headers }]
  },
}

export default withNextIntl(nextConfig)
