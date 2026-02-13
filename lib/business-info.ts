import { prisma } from "./db"

/**
 * Get business information from company settings
 * This is a server-side function that can be used in pages and components
 */
export async function getBusinessInfo() {
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

    return {
      // Company Information
      companyName: settings.companyName,
      companyEmail: settings.companyEmail,
      companyPhone: settings.companyPhone,
      companyAddress: settings.companyAddress,
      companyCity: settings.companyCity,
      companyState: settings.companyState,
      companyZipCode: settings.companyZipCode,
      companyCountry: settings.companyCountry,
      
      // Legal Information
      managingDirector: settings.managingDirector,
      commercialRegister: settings.commercialRegister,
      registerCourt: settings.registerCourt,
      vatId: settings.vatId,
      responsiblePerson: settings.responsiblePerson,
      
      // Contact Information
      supportEmail: settings.supportEmail,
      adminEmail: settings.adminEmail,
    }
  } catch (error) {
    console.error("[GET_BUSINESS_INFO_ERROR]", error)
    // Return default values on error
    return {
      companyName: "RentCar GmbH",
      companyEmail: "info@rentcar.de",
      companyPhone: "+49 (0) 30 12345678",
      companyAddress: "Musterstraße 123",
      companyCity: "10115 Berlin",
      companyState: null,
      companyZipCode: null,
      companyCountry: "Deutschland",
      managingDirector: "Max Mustermann",
      commercialRegister: "HRB 123456 B",
      registerCourt: "Amtsgericht Berlin-Charlottenburg",
      vatId: "DE123456789",
      responsiblePerson: "Max Mustermann, Musterstraße 123, 10115 Berlin, Deutschland",
      supportEmail: process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || "",
      adminEmail: process.env.ADMIN_EMAIL || "",
    }
  }
}
