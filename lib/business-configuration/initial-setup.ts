import { Prisma, type PrismaClient } from "@prisma/client"
import { BOOKING_STEPS, CONFIRMATION_SECTIONS, CUSTOMER_FIELDS } from "./domains"

const requiredCustomerFields = new Set(["FIRST_NAME", "LAST_NAME", "EMAIL"])

async function latestDraftVersion(
  tx: Prisma.TransactionClient,
  domain: Prisma.ConfigurationVersionWhereInput["domain"],
) {
  return tx.configurationVersion.findFirst({
    where: { domain, status: { in: ["DRAFT", "VALIDATED"] } },
    orderBy: { updatedAt: "desc" },
  })
}

async function createVersion(
  tx: Prisma.TransactionClient,
  actorId: string,
  domain: Prisma.ConfigurationVersionCreateInput["domain"],
  data: Omit<Prisma.ConfigurationVersionCreateInput, "domain" | "versionNumber" | "changeSummary" | "createdBy" | "updatedBy">,
) {
  const maximum = await tx.configurationVersion.aggregate({
    where: { domain },
    _max: { versionNumber: true },
  })
  return tx.configurationVersion.create({
    data: {
      ...data,
      domain,
      versionNumber: (maximum._max.versionNumber ?? 0) + 1,
      changeSummary: "Initial business setup",
      createdBy: { connect: { id: actorId } },
      updatedBy: { connect: { id: actorId } },
    },
  })
}

async function ensureLegalDraft(
  tx: Prisma.TransactionClient,
  actorId: string,
  type: "RENTAL_TERMS" | "PRIVACY_NOTICE",
) {
  const existing = await tx.legalDocumentVersion.findFirst({
    where: { type, status: { in: ["DRAFT", "PUBLISHED"] } },
    orderBy: { versionNumber: "desc" },
  })
  if (existing) return existing
  const maximum = await tx.legalDocumentVersion.aggregate({
    where: { type },
    _max: { versionNumber: true },
  })
  const versionNumber = (maximum._max.versionNumber ?? 0) + 1
  return tx.legalDocumentVersion.create({
    data: {
      type,
      versionNumber,
      versionLabel: `v${versionNumber}`,
      primaryLocale: "en",
      changeSummary: "Initial business setup",
      createdById: actorId,
      updatedById: actorId,
      translations: {
        create: {
          locale: "en",
          title: type === "RENTAL_TERMS" ? "Rental terms" : "Privacy notice",
          canonicalContent: "",
          contentHash: "0".repeat(64),
        },
      },
    },
  })
}

export async function initializeBusinessConfiguration(
  actorId: string,
  db: PrismaClient,
) {
  return db.$transaction(
    async (tx) => {
      const existingRelease = await tx.businessConfigurationRelease.findFirst({
        where: { status: { in: ["DRAFT", "VALIDATED", "ACTIVE"] } },
        orderBy: { updatedAt: "desc" },
      })
      if (existingRelease) return { releaseId: existingRelease.id, created: false }

      const settings = await tx.companySettings.findUnique({
        where: { id: "company-settings" },
        select: { currency: true, taxRate: true, taxIncluded: true, depositPercentage: true },
      })
      const currency = settings?.currency?.toUpperCase() || "EUR"
      const taxRateBps = Math.round((settings?.taxRate ?? 0) * 10_000)
      const depositBps = Math.round((settings?.depositPercentage ?? 0) * 10_000)

      const general =
        (await latestDraftVersion(tx, "GENERAL_RENTAL")) ??
        (await createVersion(tx, actorId, "GENERAL_RENTAL", {
          generalRental: {
            create: {
              businessTimeZone: "UTC",
              currency,
              supportedLocales: ["en", "de"],
            },
          },
        }))

      const pricing =
        (await latestDraftVersion(tx, "PRICING_BILLING")) ??
        (await createVersion(tx, actorId, "PRICING_BILLING", {
          pricingBilling: {
            create: {
              weeklyPricingEnabled: false,
              monthlyPricingEnabled: false,
              mixedDurationStrategy: "DAILY_ONLY",
              rentalMonthDefinition: "FIXED_30_DAYS",
              billableDayMethod: "STARTED_24_HOUR_PERIODS",
              gracePeriodMinutes: 0,
              minimumRentalMinutes: 1_440,
              minimumChargeDays: 1,
              priceTaxTreatment: settings?.taxIncluded ? "TAX_INCLUDED" : "TAX_EXCLUDED",
              taxRateBps,
            },
          },
        }))

      const insurance =
        (await latestDraftVersion(tx, "INSURANCE")) ??
        (await createVersion(tx, actorId, "INSURANCE", {
          insurance: {
            create: {
              requirementMode: "DISABLED",
              pricePerDay: 0,
              taxTreatment: "INHERIT_RENTAL",
              availabilityScope: "ALL_VEHICLES",
              showInConfirmation: true,
              showCustomerSelection: false,
              preselectedByDefault: false,
              translations: {
                create: [
                  { locale: "en", customerFacingName: "Full-cover insurance" },
                  { locale: "de", customerFacingName: "Vollkaskoversicherung" },
                ],
              },
            },
          },
        }))

      const customerDriver =
        (await latestDraftVersion(tx, "CUSTOMER_DRIVER_REQUIREMENTS")) ??
        (await createVersion(tx, actorId, "CUSTOMER_DRIVER_REQUIREMENTS", {
          customerDriverRequirements: {
            create: {
              minimumDriverAge: 18,
              minimumLicenceHeldMonths: 0,
              licenceMustCoverRentalEnd: true,
              allowedLicenceCountries: [],
              fieldRules: {
                create: CUSTOMER_FIELDS.map((field) => ({
                  field,
                  mode: requiredCustomerFields.has(field) ? "REQUIRED" : "OPTIONAL",
                })),
              },
            },
          },
        }))

      const workflow =
        (await latestDraftVersion(tx, "BOOKING_WORKFLOW")) ??
        (await createVersion(tx, actorId, "BOOKING_WORKFLOW", {
          bookingWorkflow: {
            create: {
              stepRules: {
                create: BOOKING_STEPS.map((step, displayOrder) => ({
                  step,
                  displayOrder,
                  mode: ["INSURANCE", "DOCUMENTS", "LEGAL_ACCEPTANCE"].includes(step)
                    ? "HIDDEN"
                    : "REQUIRED",
                })),
              },
            },
          },
        }))

      const documentPolicy =
        (await latestDraftVersion(tx, "DOCUMENT_POLICY")) ??
        (await createVersion(tx, actorId, "DOCUMENT_POLICY", {
          documentPolicy: {
            create: {
              retentionPreferenceDays: 90,
              identityDocumentChoice: "DISABLED",
              showReminderInConfirmation: false,
            },
          },
        }))

      const payment =
        (await latestDraftVersion(tx, "PAYMENTS")) ??
        (await createVersion(tx, actorId, "PAYMENTS", {
          paymentRules: {
            create: {
              defaultMethod: "CASH_ON_PICKUP",
              confirmationMode: "REQUIRES_REVIEW",
              depositType: depositBps > 0 ? "PERCENTAGE_BPS" : "NONE",
              depositValue: depositBps,
              remainingBalanceRule: depositBps > 0 ? "ON_PICKUP" : "NOT_APPLICABLE",
              methods: { create: { method: "CASH_ON_PICKUP", enabled: true } },
              instructions: {
                create: [
                  { method: "CASH_ON_PICKUP", locale: "en", instructions: "Pay when collecting the vehicle." },
                  { method: "CASH_ON_PICKUP", locale: "de", instructions: "Bezahlen Sie bei der Fahrzeugabholung." },
                ],
              },
            },
          },
        }))

      for (const section of CONFIRMATION_SECTIONS) {
        await tx.confirmationSectionDefinition.upsert({
          where: { key: section },
          update: {},
          create: { key: section, name: section.replaceAll("_", " ").toLowerCase() },
        })
      }
      const sectionDefinitions = await tx.confirmationSectionDefinition.findMany({
        where: { key: { in: [...CONFIRMATION_SECTIONS] } },
        select: { id: true },
      })
      const confirmation =
        (await latestDraftVersion(tx, "CONFIRMATIONS")) ??
        (await createVersion(tx, actorId, "CONFIRMATIONS", {
          confirmation: {
            create: {
              sections: {
                create: sectionDefinitions.map(({ id }) => ({ sectionDefinitionId: id, enabled: true })),
              },
              translations: {
                create: [
                  { locale: "en", heading: "Booking request received" },
                  { locale: "de", heading: "Buchungsanfrage erhalten" },
                ],
              },
            },
          },
        }))

      const terms = await ensureLegalDraft(tx, actorId, "RENTAL_TERMS")
      const privacy = await ensureLegalDraft(tx, actorId, "PRIVACY_NOTICE")
      const legal =
        (await latestDraftVersion(tx, "LEGAL_ACCEPTANCE")) ??
        (await createVersion(tx, actorId, "LEGAL_ACCEPTANCE", {
          legalAcceptance: {
            create: {
              termsDocumentVersionId: terms.id,
              privacyDocumentVersionId: privacy.id,
              termsAcceptance: "DISABLED",
              privacyAcknowledgment: "DISABLED",
              retainContentSnapshot: true,
              bookingEnforcementEnabled: false,
              requiredLocales: [],
              showInConfirmation: false,
              translations: {
                create: [
                  { locale: "en", termsLinkLabel: "Rental terms", privacyLinkLabel: "Privacy notice" },
                  { locale: "de", termsLinkLabel: "Mietbedingungen", privacyLinkLabel: "Datenschutzhinweis" },
                ],
              },
            },
          },
        }))

      const cars = await tx.car.findMany({
        where: { isDeleted: false },
        select: { id: true, price: true },
      })
      const fleet =
        (await tx.fleetRateSet.findFirst({
          where: { status: { in: ["DRAFT", "VALIDATED"] } },
          orderBy: { updatedAt: "desc" },
        })) ??
        (await tx.fleetRateSet.create({
          data: {
            versionNumber: 1,
            currency,
            changeSummary: "Initial business setup",
            createdById: actorId,
            updatedById: actorId,
            rates: {
              create: cars.map((car) => ({ carId: car.id, dailyRate: car.price })),
            },
          },
        }))

      const maximumRelease = await tx.businessConfigurationRelease.aggregate({
        _max: { releaseNumber: true },
      })
      const release = await tx.businessConfigurationRelease.create({
        data: {
          releaseNumber: (maximumRelease._max.releaseNumber ?? 0) + 1,
          name: "Initial business setup",
          changeSummary: "Owner-guided initial setup",
          generalRentalConfigVersionId: general.id,
          pricingBillingConfigVersionId: pricing.id,
          fleetRateSetId: fleet.id,
          insuranceConfigVersionId: insurance.id,
          customerDriverConfigVersionId: customerDriver.id,
          bookingWorkflowConfigVersionId: workflow.id,
          documentPolicyConfigVersionId: documentPolicy.id,
          paymentConfigVersionId: payment.id,
          confirmationConfigVersionId: confirmation.id,
          legalAcceptanceConfigVersionId: legal.id,
          createdById: actorId,
          updatedById: actorId,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorUserId: actorId,
          category: "CONFIGURATION",
          action: "configuration.initial_setup_created",
          targetType: "BusinessConfigurationRelease",
          targetId: release.id,
          configurationReleaseId: release.id,
        },
      })
      return { releaseId: release.id, created: true }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )
}
