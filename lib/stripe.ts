import Stripe from "stripe"

const stripeSecretKey = process.env.STRIPE_SECRET_KEY

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2025-12-15.clover",
      typescript: true,
    })
  : null

export function requireStripe() {
  if (!stripe) {
    throw new Error("STRIPE_SECRET_KEY is not set")
  }

  return stripe
}

export function formatAmountForStripe(amount: number): number {
  // Amount is already in cents from our DB
  return Math.round(amount)
}

export function formatAmountFromStripe(amount: number): number {
  return amount
}
