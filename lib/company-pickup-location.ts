export interface CompanyPickupAddressParts {
  companyAddress?: string | null
  companyCity?: string | null
  companyState?: string | null
  companyZipCode?: string | null
  companyCountry?: string | null
}

function value(input: string | null | undefined) {
  return input?.trim() || null
}

export function formatCompanyPickupLocation(settings: CompanyPickupAddressParts | null | undefined): string | null {
  if (!settings) return null

  const street = value(settings.companyAddress)
  const city = value(settings.companyCity)
  const postalCode = value(settings.companyZipCode)
  const country = value(settings.companyCountry)
  if (!street || !city || !postalCode || !country) return null

  return [street, `${postalCode} ${city}`, value(settings.companyState), country].filter(Boolean).join(", ")
}
