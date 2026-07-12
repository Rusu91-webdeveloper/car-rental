import type { PricingContextRepository } from "@/lib/pricing/repositories"
import { resolvePricingContext, type PricingContextRequest } from "@/lib/pricing/runtime-resolver"
import { calculatePricing } from "@/lib/pricing/engine"
import { checkedMultiply, money, multiplyByBasisPoints } from "@/lib/pricing/money"
import type { BookingPricingQuote } from "@/lib/pricing/types"
import type { ConfigurationDbClient } from "@/lib/business-configuration/prisma-repository"
import { resolvePublicBookingConfiguration } from "./runtime"
import type { ActiveInsuranceOffer, PublicBookingConfiguration } from "./types"
import { PricingError } from "@/lib/pricing/errors"

export interface ConfiguredRentalQuote {
  quote: BookingPricingQuote
  configuration: PublicBookingConfiguration
  insurance?: ActiveInsuranceOffer & {
    selected: boolean
    unitPrice: number
    billableDays: number
    subtotal: number
    capturedAt: string
  }
}

export async function quoteConfiguredVehicleRental(input: {
  db: ConfigurationDbClient
  pricingRepository: PricingContextRepository
  request: PricingContextRequest
  insuranceSelected?: boolean
  locale: string
}): Promise<ConfiguredRentalQuote> {
  const configuration = await resolvePublicBookingConfiguration({
    db: input.db,
    vehicleId: input.request.vehicleId,
    locale: input.locale,
  })
  const context = await resolvePricingContext(input.pricingRepository, input.request)
  const base = calculatePricing(context.pricingRequest)
  let insuranceEvidence: ConfiguredRentalQuote["insurance"]
  let insuranceSubtotal = 0
  if (configuration.mode === "ACTIVE_RELEASE" && configuration.insurance) {
    const offer = configuration.insurance
    const requested = Boolean(input.insuranceSelected)
    if (!offer.enabled && requested)
      throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "Disabled insurance cannot be selected.", "VALIDATION")
    if (offer.enabled && !offer.availableForVehicle && requested)
      throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "Insurance is unavailable for this vehicle.", "VALIDATION")
    const selected = offer.enabled && offer.availableForVehicle && (offer.requirementMode === "MANDATORY" || requested)
    if (offer.requirementMode === "MANDATORY" && !offer.availableForVehicle)
      throw new PricingError(
        "ACTIVE_CONFIGURATION_INVALID",
        "Mandatory insurance is unavailable for this vehicle.",
        "OPERATIONAL",
      )
    insuranceSubtotal = selected
      ? checkedMultiply(offer.pricePerDay, base.chargeableDuration.chargeableDays, "insurance subtotal")
      : 0
    insuranceEvidence = {
      ...offer,
      selected,
      unitPrice: offer.pricePerDay,
      billableDays: base.chargeableDuration.chargeableDays,
      subtotal: insuranceSubtotal,
      capturedAt: new Date().toISOString(),
    }
  }
  const result = calculatePricing({
    ...context.pricingRequest,
    insuranceSubtotal: money(insuranceSubtotal, base.currency),
    insuranceTaxTreatment: insuranceEvidence?.taxTreatment ?? "INHERIT_RENTAL",
  })
  return {
    configuration,
    insurance: insuranceEvidence,
    quote: {
      ...result,
      payment: {
        depositAmount: multiplyByBasisPoints(result.grandTotal, context.depositRateBps),
        guaranteeAmount: multiplyByBasisPoints(result.grandTotal, context.guaranteeRateBps),
        depositRateBps: context.depositRateBps,
        guaranteeRateBps: context.guaranteeRateBps,
      },
    },
  }
}
