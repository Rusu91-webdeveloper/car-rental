import { prisma } from "@/lib/db"

// Get payment details from database, with fallback to environment variables or defaults
export async function getPaymentDetails() {
  try {
    const settings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })

    if (settings) {
      return {
        bankName: settings.bankName || process.env.NEXT_PUBLIC_BANK_NAME || "Your Bank Name",
        accountName: settings.accountName || process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || "Car Rental Company",
        accountNumber: settings.accountNumber || process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || "1234567890",
        swiftCode: settings.swiftCode || process.env.NEXT_PUBLIC_BANK_SWIFT_CODE || "YOURSWIFT",
        iban: settings.iban,
      }
    }
  } catch (error) {
    console.error("[GET_PAYMENT_DETAILS_ERROR]", error)
  }

  // Fallback to environment variables or defaults
  return {
    bankName: process.env.NEXT_PUBLIC_BANK_NAME || "Your Bank Name",
    accountName: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || "Car Rental Company",
    accountNumber: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || "1234567890",
    swiftCode: process.env.NEXT_PUBLIC_BANK_SWIFT_CODE || "YOURSWIFT",
    iban: undefined,
  }
}

// Legacy export for backward compatibility (deprecated - use getPaymentDetails instead)
export const paymentDetails = {
  bankName: process.env.NEXT_PUBLIC_BANK_NAME || "Your Bank Name",
  accountName: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || "Car Rental Company",
  accountNumber: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || "1234567890",
  swiftCode: process.env.NEXT_PUBLIC_BANK_SWIFT_CODE || "YOURSWIFT",
}
