import { calculatePricing } from "./engine"
import { multiplyByBasisPoints } from "./money"
import type { PricingContextRepository } from "./repositories"
import { resolvePricingContext, type PricingContextRequest } from "./runtime-resolver"
import type { BookingPricingQuote } from "./types"

export async function quoteVehicleRental(
  repository: PricingContextRepository,
  request: PricingContextRequest,
): Promise<BookingPricingQuote> {
  const context = await resolvePricingContext(repository, request)
  const result = calculatePricing(context.pricingRequest)
  return {
    ...result,
    payment: {
      depositAmount: multiplyByBasisPoints(result.grandTotal, context.depositRateBps),
      guaranteeAmount: multiplyByBasisPoints(result.grandTotal, context.guaranteeRateBps),
      depositRateBps: context.depositRateBps,
      guaranteeRateBps: context.guaranteeRateBps,
    },
  }
}
