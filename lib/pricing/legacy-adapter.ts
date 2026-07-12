import type { LegacyVehicleRateRecord, PricingContextRepository } from "./repositories"
import { quoteVehicleRental } from "./quote-service"

export interface LegacyPricingAdapterInput {
  vehicleId: string
  pickupAt: Date
  returnAt: Date
  carPriceMinorUnits: number
  currency?: string
  taxRate?: number
  taxIncluded?: boolean
  depositPercentage?: number
  guaranteePercentage?: number
  paymentMethod?: "TRANSFER" | "PAY_AT_PICKUP"
  calculatedAt?: Date
}

export async function quoteLegacyPricing(input: LegacyPricingAdapterInput) {
  const legacy: LegacyVehicleRateRecord = {
    vehicleId: input.vehicleId,
    dailyRate: input.carPriceMinorUnits,
    currency: input.currency ?? "EUR",
    taxIncluded: input.taxIncluded ?? false,
    taxRateFraction: input.taxRate ?? 0,
    depositFraction: input.depositPercentage ?? 0.2,
    guaranteeFraction: input.guaranteePercentage ?? 0,
  }
  const repository: PricingContextRepository = {
    async findActivePricingConfiguration() {
      return null
    },
    async findLegacyVehicleRate() {
      return legacy
    },
  }
  return quoteVehicleRental(repository, {
    vehicleId: input.vehicleId,
    pickupAt: input.pickupAt,
    returnAt: input.returnAt,
    paymentMethod: input.paymentMethod ?? "TRANSFER",
    calculatedAt: input.calculatedAt,
  })
}
