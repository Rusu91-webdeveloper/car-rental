import { Prisma, type PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/db"
import {
  createLegalDraft,
  loadLegalAdministrationPage,
} from "@/lib/legal/service"
import {
  attachPhase6DraftsToRelease,
  createPhase6Draft,
  loadPhase6ConfigurationPage,
} from "@/lib/phase6-admin/service"
import {
  attachPricingDraftToRelease,
  createPricingDraft,
  loadPricingConfigurationPage,
} from "@/lib/pricing-admin/service"
import {
  createNotificationConfigurationDraft,
  loadNotificationConfigurationPage,
} from "@/lib/notification-configuration/service"

export interface OwnerSettingsPageSearchParams {
  edit?: string
}

export async function ownerSettingsPageMode(
  searchParams: Promise<OwnerSettingsPageSearchParams>,
  setupNextHref: string,
) {
  const editing = (await searchParams).edit === "1"
  return {
    editing,
    nextHref: editing ? "/admin/settings" : setupNextHref,
  }
}

export async function ensureOwnerDraftRelease(actorId: string, db: PrismaClient = prisma) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('owner-settings-edit-release'))`
      const existing = await tx.businessConfigurationRelease.findFirst({
        where: { status: { in: ["DRAFT", "VALIDATED"] } },
        orderBy: { updatedAt: "desc" },
      })
      if (existing) return existing

      const active = await tx.businessConfigurationRelease.findFirst({
        where: { status: "ACTIVE" },
        orderBy: { activatedAt: "desc" },
      })
      if (!active) throw new Error("Finish the initial business setup before editing completed settings.")

      const maximum = await tx.businessConfigurationRelease.aggregate({
        _max: { releaseNumber: true },
      })
      const releaseNumber = (maximum._max.releaseNumber ?? 0) + 1
      const created = await tx.businessConfigurationRelease.create({
        data: {
          releaseNumber,
          name: `Business settings update ${releaseNumber}`,
          changeSummary: "Business settings update",
          generalRentalConfigVersionId: active.generalRentalConfigVersionId,
          pricingBillingConfigVersionId: active.pricingBillingConfigVersionId,
          fleetRateSetId: active.fleetRateSetId,
          insuranceConfigVersionId: active.insuranceConfigVersionId,
          customerDriverConfigVersionId: active.customerDriverConfigVersionId,
          bookingWorkflowConfigVersionId: active.bookingWorkflowConfigVersionId,
          documentPolicyConfigVersionId: active.documentPolicyConfigVersionId,
          paymentConfigVersionId: active.paymentConfigVersionId,
          confirmationConfigVersionId: active.confirmationConfigVersionId,
          legalAcceptanceConfigVersionId: active.legalAcceptanceConfigVersionId,
          supersedesReleaseId: active.id,
          createdById: actorId,
          updatedById: actorId,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorUserId: actorId,
          category: "CONFIGURATION",
          action: "owner_setup.edit_started",
          targetType: "BusinessConfigurationRelease",
          targetId: created.id,
          configurationReleaseId: created.id,
        },
      })
      return created
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )
}

export async function prepareOwnerPricingEdit(actorId: string) {
  await ensureOwnerDraftRelease(actorId)
  let data = await loadPricingConfigurationPage()
  if (!data.draftPricing || !data.draftFleet) {
    await createPricingDraft({
      actorId,
      source: data.livePricing ? "LIVE" : "LEGACY",
      changeSummary: "Rental rules update",
    })
    data = await loadPricingConfigurationPage()
  }
  if (!data.pricingDraftAttached || !data.fleetDraftAttached) {
    await attachPricingDraftToRelease({ actorId })
  }
  return loadPricingConfigurationPage()
}

export async function prepareOwnerBookingExperienceEdit(actorId: string) {
  await ensureOwnerDraftRelease(actorId)
  let data = await loadPhase6ConfigurationPage()
  const missing = [
    {
      domain: "INSURANCE" as const,
      missing: !data.draftInsurance,
      source: data.liveInsurance ? ("LIVE" as const) : ("DEFAULT" as const),
    },
    {
      domain: "CUSTOMER_DRIVER_REQUIREMENTS" as const,
      missing: !data.draftCustomerDriver,
      source: data.liveCustomerDriver ? ("LIVE" as const) : ("DEFAULT" as const),
    },
    {
      domain: "BOOKING_WORKFLOW" as const,
      missing: !data.draftWorkflow,
      source: data.liveWorkflow ? ("LIVE" as const) : ("DEFAULT" as const),
    },
  ]
  for (const item of missing) {
    if (!item.missing) continue
    await createPhase6Draft({
      actorId,
      domain: item.domain,
      source: item.source,
      changeSummary: "Booking experience update",
    })
  }
  data = await loadPhase6ConfigurationPage()
  if (!data.attached.insurance || !data.attached.customerDriver || !data.attached.workflow) {
    await attachPhase6DraftsToRelease({ actorId })
  }
  return loadPhase6ConfigurationPage()
}

export async function prepareOwnerNotificationEdit(actorId: string) {
  await ensureOwnerDraftRelease(actorId)
  let data = await loadNotificationConfigurationPage()
  if (!data.draftPayment || !data.draftConfirmation) {
    await createNotificationConfigurationDraft({
      actorId,
      changeSummary: "Customer payment and message update",
    })
    data = await loadNotificationConfigurationPage()
  }
  return data
}

export async function prepareOwnerLegalEdit(actorId: string) {
  await ensureOwnerDraftRelease(actorId)
  let data = await loadLegalAdministrationPage()
  for (const type of ["RENTAL_TERMS", "PRIVACY_NOTICE"] as const) {
    const documents = data.documents.filter((document) => document.type === type)
    if (documents.some((document) => document.status === "DRAFT") || documents.some((document) => document.status === "PUBLISHED")) continue
    await createLegalDraft({
      actorId,
      type,
      primaryLocale: "en",
      changeSummary: `${type === "RENTAL_TERMS" ? "Rental Terms" : "Privacy Notice"} setup`,
    })
    data = await loadLegalAdministrationPage()
  }
  return data
}
