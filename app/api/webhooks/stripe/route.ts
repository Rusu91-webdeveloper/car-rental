import { headers } from "next/headers"
import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/db"

export async function POST(req: Request) {
  if (!stripe) {
    return new NextResponse("Stripe is not configured", { status: 500 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return new NextResponse("Stripe webhook secret is not configured", { status: 500 })
  }

  const body = await req.text()
  const headersList = await headers()
  const signature = headersList.get("stripe-signature")

  if (!signature) {
    return new NextResponse("No signature", { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error("[STRIPE_WEBHOOK_ERROR]", err)
    return new NextResponse(`Webhook Error: ${err instanceof Error ? err.message : "Unknown error"}`, {
      status: 400,
    })
  }

  const session = event.data.object as Stripe.Checkout.Session

  // Idempotency: check if we've already processed this event
  if (event.type === "checkout.session.completed") {
    try {
      // Find booking by Stripe session ID
      const booking = await prisma.booking.findUnique({
        where: { stripeSessionId: session.id },
      })

      if (!booking) {
        console.error("[STRIPE_WEBHOOK] Booking not found for session:", session.id)
        return new NextResponse("Booking not found", { status: 404 })
      }

      // Idempotency check: if already paid, skip
      if (booking.paymentStatus === "PAID") {
        console.log("[STRIPE_WEBHOOK] Booking already marked as paid:", booking.id)
        return new NextResponse("Already processed", { status: 200 })
      }

      // Update booking and create payment record in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: "PAID",
            stripePaymentIntentId: session.payment_intent as string,
          },
        })

        await tx.payment.create({
          data: {
            bookingId: booking.id,
            amount: session.amount_total || 0,
            currency: session.currency || "eur",
            status: "PAID",
            stripePaymentIntentId: session.payment_intent as string,
            metadata: session.metadata,
          },
        })
      })

      console.log("[STRIPE_WEBHOOK] Payment processed for booking:", booking.id)

      // TODO: Send confirmation email here
    } catch (error) {
      console.error("[STRIPE_WEBHOOK_PROCESSING_ERROR]", error)
      return new NextResponse("Webhook processing failed", { status: 500 })
    }
  }

  return new NextResponse("Success", { status: 200 })
}
