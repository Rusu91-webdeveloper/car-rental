"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { z } from "zod"
import { Prisma } from "@prisma/client"

const companySettingsSchema = z.object({
  // Company Information
  companyName: z.string().min(1, "Company name is required"),
  companyEmail: z.string().email("Invalid email address"),
  companyPhone: z.string().optional(),
  companyAddress: z.string().optional(),
  companyCity: z.string().optional(),
  companyState: z.string().optional(),
  companyZipCode: z.string().optional(),
  companyCountry: z.string().optional(),
  
  // Legal Information (for Impressum/Imprint)
  managingDirector: z.string().optional(),
  commercialRegister: z.string().optional(),
  registerCourt: z.string().optional(),
  vatId: z.string().optional(),
  responsiblePerson: z.string().optional(),
  
  // Bank/Payment Details
  bankName: z.string().min(1, "Bank name is required"),
  accountName: z.string().min(1, "Account name is required"),
  accountNumber: z.string().min(1, "Account number is required"),
  swiftCode: z.string().min(1, "SWIFT code is required"),
  iban: z.string().optional(),
  
  // Tax Configuration
  taxRate: z.number().min(0).max(1, "Tax rate must be between 0 and 1"),
  taxIncluded: z.boolean(),
  depositPercentage: z.number().min(0).max(1, "Deposit percentage must be between 0 and 1"),
  guaranteePercentage: z.number().min(0).max(1, "Guarantee percentage must be between 0 and 1"),
  
  // Email Configuration
  supportEmail: z.string().email("Invalid support email"),
  adminEmail: z.string().email("Invalid admin email"),
  
  // Additional Settings
  currency: z.string().min(1, "Currency is required"),
  currencySymbol: z.string().min(1, "Currency symbol is required"),
})

export async function getCompanySettings() {
  try {
    let settings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })

    // If settings don't exist, create default settings
    if (!settings) {
      settings = await prisma.companySettings.create({
        data: {
          id: "company-settings",
        },
      })
    }

    return { success: true, settings }
  } catch (error) {
    console.error("[GET_COMPANY_SETTINGS_ERROR]", error)
    return { error: "Failed to fetch company settings" }
  }
}

export async function updateCompanySettings(data: unknown) {
  try {
    const admin = await requireAdmin()

    // Validate input
    const validated = companySettingsSchema.parse(data)

    // Get existing settings for audit log
    const existingSettings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })

    // Update or create settings
    const settings = await prisma.companySettings.upsert({
      where: { id: "company-settings" },
      update: validated,
      create: {
        id: "company-settings",
        ...validated,
      },
    })

    // Create audit log
    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "SETTINGS_UPDATED",
        targetType: "settings",
        targetId: "company-settings",
        oldValue: existingSettings ? (existingSettings as any) : Prisma.JsonNull,
        newValue: validated as any,
      },
    })

    // Revalidate all pages that use business information
    revalidatePath("/admin")
    revalidatePath("/")
    revalidatePath("/impressum")
    revalidatePath("/datenschutz")
    revalidatePath("/agb")
    revalidatePath("/widerruf")
    revalidatePath("/about")
    revalidatePath("/contact")

    return { success: true, settings }
  } catch (error) {
    console.error("[UPDATE_COMPANY_SETTINGS_ERROR]", error)

    if (error instanceof z.ZodError) {
      return { error: error.errors[0]?.message || "Validation error" }
    }

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to update company settings" }
  }
}
