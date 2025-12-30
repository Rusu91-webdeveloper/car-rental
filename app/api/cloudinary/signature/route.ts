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

export async function POST(req: Request) {
  try {
    await requireAdmin()
    const body = await req.json().catch(() => ({}))
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json({ error: "Cloudinary is not configured" }, { status: 500 })
    }

    const defaultFolder = process.env.CLOUDINARY_FOLDER || "rentcar/cars"
    const folder =
      typeof body?.folder === "string" && body.folder.trim().length > 0 ? body.folder.trim() : defaultFolder
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = signCloudinaryParams({ folder, timestamp }, apiSecret)

    return NextResponse.json({
      cloudName,
      apiKey,
      folder,
      timestamp,
      signature,
    })
  } catch (error) {
    console.error("[CLOUDINARY_SIGNATURE_ERROR]", error)
    return NextResponse.json({ error: "Failed to create upload signature" }, { status: 500 })
  }
}
