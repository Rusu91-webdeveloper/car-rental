"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { initializeBusinessConfiguration } from "@/lib/business-configuration/initial-setup"

export async function startBusinessSetupAction() {
  try {
    const admin = await requireAdmin()
    const result = await initializeBusinessConfiguration(admin.id, prisma)
    revalidatePath("/admin")
    revalidatePath("/admin/settings")
    revalidatePath("/admin/bookings/settings")
    revalidatePath("/admin/advanced/configuration")
    return { success: true as const, result }
  } catch (error) {
    console.error("[START_BUSINESS_SETUP_ERROR]", error)
    return {
      error: error instanceof Error ? error.message : "Business setup could not be started.",
    }
  }
}
