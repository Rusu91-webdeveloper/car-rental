import { Prisma, type PrismaClient } from "@prisma/client"
import { isCarAvailable } from "@/lib/availability"
import { PricingError } from "./errors"
import { PrismaPricingContextRepository } from "./prisma-repository"
import { toBookingPricingSnapshotData } from "./snapshot"
import { quoteConfiguredVehicleRental } from "@/lib/booking-configuration/quote-service"
import { normalizeAndValidateBookingFields } from "@/lib/booking-configuration/field-resolver"
import { evaluateDriverEligibility } from "@/lib/booking-configuration/driver-eligibility"
import type { BookingCustomerDriverInput } from "@/lib/booking-configuration/types"
import { PrismaBookingConfigurationRepository } from "@/lib/booking-configuration/prisma-repository"
import type { SubmittedLegalAcknowledgements } from "@/lib/legal/types"

export interface AuthoritativeBookingInput {
  userId: string
  vehicleId: string
  pickupAt: Date
  returnAt: Date
  location: string
  locale: "de" | "en"
  paymentMethod: "TRANSFER" | "PAY_AT_PICKUP"
  bookingNumber: string
  transferCode: string
  customer?: BookingCustomerDriverInput
  insuranceSelected?: boolean
  legalAcknowledgements?: SubmittedLegalAcknowledgements
}

function assertRequiredLegalAcknowledgements(
  legal: Awaited<ReturnType<typeof quoteConfiguredVehicleRental>>["configuration"]["legal"],
  submitted: SubmittedLegalAcknowledgements | undefined,
) {
  if (!legal) return
  for (const document of legal.documents) {
    if (document.requirement !== "REQUIRED") continue
    const acknowledged =
      document.type === "RENTAL_TERMS" ? submitted?.rentalTerms : submitted?.privacyNotice
    if (acknowledged !== true)
      throw new PricingError(
        "LEGAL_ACKNOWLEDGEMENT_REQUIRED",
        `You must acknowledge the ${document.title} before booking.`,
        "VALIDATION",
      )
  }
}

export async function createAuthoritativeBooking(db: PrismaClient, input: AuthoritativeBookingInput) {
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Car" WHERE id = ${input.vehicleId} FOR UPDATE`

        const car = await tx.car.findUnique({ where: { id: input.vehicleId } })
        if (!car || car.isDeleted) throw new Error("Car not found")
        if (car.status === "RENTED" || car.status === "MAINTENANCE") {
          throw new Error("Car is not available for booking")
        }
        const stillAvailable = await isCarAvailable(input.vehicleId, input.pickupAt, input.returnAt, undefined, tx)
        if (!stillAvailable) throw new Error("Car is no longer available")

        const configured = await quoteConfiguredVehicleRental({
          db: tx,
          pricingRepository: new PrismaPricingContextRepository(tx),
          locale: input.locale,
          insuranceSelected: input.insuranceSelected,
          request: {
            vehicleId: input.vehicleId,
            pickupAt: input.pickupAt,
            returnAt: input.returnAt,
            paymentMethod: input.paymentMethod,
          },
        })
        const { quote } = configured
        assertRequiredLegalAcknowledgements(configured.configuration.legal, input.legalAcknowledgements)
        let normalizedCustomer: BookingCustomerDriverInput | undefined
        let validatedAt: Date | undefined
        if (configured.configuration.mode === "ACTIVE_RELEASE") {
          const fields = normalizeAndValidateBookingFields(configured.configuration.fields, input.customer ?? {})
          if (fields.issues.length) throw new Error(fields.issues[0].message)
          normalizedCustomer = fields.normalized
          const active = await new PrismaBookingConfigurationRepository(tx).findActiveConfiguration(
            input.vehicleId,
            input.locale,
          )
          if (!active)
            throw new PricingError(
              "ACTIVE_CONFIGURATION_INVALID",
              "Active booking configuration disappeared.",
              "OPERATIONAL",
            )
          const eligibility = evaluateDriverEligibility({
            rules: active.customerDriver,
            customer: normalizedCustomer,
            pickupAt: input.pickupAt,
            returnAt: input.returnAt,
            businessTimeZone: active.businessTimeZone,
          })
          if (!eligibility.eligible)
            throw new Error(eligibility.issues[0]?.message ?? "Driver is not eligible for this rental.")
          validatedAt = new Date(eligibility.evaluatedAt)
        }
        const booking = await tx.booking.create({
          data: {
            userId: input.userId,
            carId: input.vehicleId,
            locale: input.locale,
            pickupDate: input.pickupAt,
            dropoffDate: input.returnAt,
            location: input.location,
            pricePerDay: quote.sourceDailyRate,
            totalDays: quote.chargeableDuration.chargeableDays,
            totalPrice: quote.grandTotal,
            depositAmount: quote.payment.depositAmount,
            guaranteeAmount: quote.payment.guaranteeAmount,
            transferCode: input.transferCode,
            bookingNumber: input.bookingNumber,
            status: "PENDING",
            paymentStatus: "PENDING",
            paymentMethod: input.paymentMethod,
          },
        })

        const snapshot = toBookingPricingSnapshotData(booking.id, quote)
        let legalAcceptedAt: Date | undefined
        try {
          await tx.bookingPricingSnapshot.create({
            data: {
              ...snapshot,
              calculationTrace: snapshot.calculationTrace as unknown as Prisma.InputJsonValue,
            },
          })
          if (configured.configuration.mode === "ACTIVE_RELEASE" && normalizedCustomer && validatedAt) {
            const date = (value: string | undefined) => (value ? new Date(`${value}T00:00:00.000Z`) : undefined)
            await tx.bookingCustomerDriverSnapshot.create({
              data: {
                bookingId: booking.id,
                customerDriverConfigVersionId: configured.configuration.customerDriverConfigVersionId!,
                firstName: normalizedCustomer.firstName!,
                lastName: normalizedCustomer.lastName!,
                email: normalizedCustomer.email!,
                phone: normalizedCustomer.phone,
                dateOfBirth: date(normalizedCustomer.dateOfBirth),
                country: normalizedCustomer.country,
                address: normalizedCustomer.address,
                city: normalizedCustomer.city,
                postalCode: normalizedCustomer.postalCode,
                nationality: normalizedCustomer.nationality,
                licenceNumber: normalizedCustomer.licenceNumber,
                licenceIssueDate: date(normalizedCustomer.licenceIssueDate),
                licenceExpiryDate: date(normalizedCustomer.licenceExpiryDate),
                licenceIssuingCountry: normalizedCustomer.licenceIssuingCountry,
                licenceHeldSinceDate: undefined,
                capturedAt: new Date(),
                validatedAt,
              },
            })
            if (configured.insurance)
              await tx.bookingInsuranceSnapshot.create({
                data: {
                  bookingId: booking.id,
                  insuranceConfigVersionId: configured.insurance.configurationVersionId,
                  availabilityVehicleId:
                    configured.insurance.availabilityScope === "SELECTED_VEHICLES"
                      ? configured.insurance.availabilityVehicleId
                      : undefined,
                  selected: configured.insurance.selected,
                  requirementMode: configured.insurance.requirementMode,
                  customerFacingName: configured.insurance.customerFacingName,
                  description: configured.insurance.description,
                  unitPrice: configured.insurance.unitPrice,
                  billableDays: configured.insurance.billableDays,
                  subtotal: configured.insurance.subtotal,
                  currency: configured.insurance.currency,
                  taxTreatment: configured.insurance.taxTreatment,
                  availabilityScope: configured.insurance.availabilityScope,
                  customerSelectionShown: configured.insurance.showCustomerSelection,
                  preselected: configured.insurance.preselectedByDefault,
                  showInConfirmation: configured.insurance.showInConfirmation,
                  capturedAt: new Date(configured.insurance.capturedAt),
                },
              })
            if (configured.configuration.legal) {
              const acceptedAt = new Date()
              legalAcceptedAt = acceptedAt
              const requiredDocuments = configured.configuration.legal.documents.filter(
                ({ requirement }) => requirement === "REQUIRED",
              )
              if (requiredDocuments.length)
                await tx.bookingLegalAcceptance.createMany({
                  data: requiredDocuments.map((document) => ({
                    bookingId: booking.id,
                    legalDocumentTranslationId: document.legalDocumentTranslationId,
                    customerUserId: input.userId,
                    configurationReleaseId: configured.configuration.legal!.configurationReleaseId,
                    legalAcceptanceConfigVersionId:
                      configured.configuration.legal!.legalAcceptanceConfigVersionId,
                    documentType: document.type,
                    documentVersionNumber: document.versionNumber,
                    locale: document.locale,
                    contentHash: document.contentHash,
                    accepted: true,
                    acceptedAt,
                    source: "CUSTOMER_CHECKBOX",
                    contentSnapshot: configured.configuration.legal!.retainContentSnapshot
                      ? document.canonicalContent
                      : undefined,
                  })),
                })
            }
          }
        } catch {
          console.error("[BOOKING_SNAPSHOT_ERROR]", {
            bookingId: booking.id,
            snapshotType: "authoritative",
          })
          throw new PricingError(
            "SNAPSHOT_PERSISTENCE_FAILED",
            "Booking pricing snapshot could not be persisted.",
            "OPERATIONAL",
          )
        }

        return {
          booking,
          quote,
          configuration: configured.configuration,
          insurance: configured.insurance,
          customer: normalizedCustomer,
          legalAcceptances:
            configured.configuration.legal?.showInConfirmation
              ? configured.configuration.legal.documents
                  .filter(({ requirement }) => requirement === "REQUIRED")
                  .map(({ type, title, versionNumber, versionLabel, locale }) => ({
                    type,
                    title,
                    versionNumber,
                    versionLabel,
                    locale,
                    acceptedAt: legalAcceptedAt!,
                  }))
              : [],
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new Error("Car is no longer available")
    }
    throw error
  }
}
