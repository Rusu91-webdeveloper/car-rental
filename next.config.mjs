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
