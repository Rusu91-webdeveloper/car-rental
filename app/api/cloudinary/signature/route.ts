import { NextResponse } from "next/server"
import crypto from "crypto"
import { requireAdmin } from "@/lib/auth"

function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")

  return crypto.createHash("sha1").update(payload + apiSecret).digest("hex")
}

export async function POST() {
  try {
    await requireAdmin()
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json({ error: "Cloudinary is not configured" }, { status: 500, headers: { "Cache-Control": "private, no-store" } })
    }

    const folder = process.env.CLOUDINARY_FOLDER || "rentcar/cars"
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = signCloudinaryParams({ folder, timestamp }, apiSecret)

    return NextResponse.json(
      { cloudName, apiKey, folder, timestamp, signature },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    console.error("[CLOUDINARY_SIGNATURE_ERROR]", error)
    return NextResponse.json({ error: "Failed to create upload signature" }, { status: 500, headers: { "Cache-Control": "private, no-store" } })
  }
}
