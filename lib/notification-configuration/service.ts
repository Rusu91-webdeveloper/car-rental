import { Prisma, type PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/db"
import { CAPABILITIES, type Capability } from "@/lib/authorization/capabilities"
import { databaseUserHasCapability } from "@/lib/authorization/database-capabilities"
import {
  CONFIRMATION_SECTIONS,
  PAYMENT_METHODS,
  type ConfirmationConfiguration,
  type PaymentConfiguration,
} from "@/lib/business-configuration/domains"
import {
  confirmationConfigurationSchema,
  paymentConfigurationSchema,
} from "@/lib/business-configuration/schema"
import { ConfigurationWorkflowError } from "@/lib/business-configuration/workflow-errors"

const MANUAL_METHODS = ["BANK_TRANSFER", "CASH_ON_PICKUP"] as const
export type ManualPaymentMethod = (typeof MANUAL_METHODS)[number]

const paymentInclude = {
  version: { include: { updatedBy: { select: { name: true, email: true } } } },
  methods: true,
  instructions: { orderBy: [{ method: "asc" }, { locale: "asc" }] },
} satisfies Prisma.PaymentConfigVersionInclude

const confirmationInclude = {
  version: { include: { updatedBy: { select: { name: true, email: true } } } },
  sections: { include: { sectionDefinition: true } },
  translations: { orderBy: { locale: "asc" } },
} satisfies Prisma.ConfirmationConfigVersionInclude

type PaymentRow = Prisma.PaymentConfigVersionGetPayload<{ include: typeof paymentInclude }>
type ConfirmationRow = Prisma.ConfirmationConfigVersionGetPayload<{ include: typeof confirmationInclude }>

export interface NotificationConfigurationVersion<T> {
  id: string
  versionNumber: number
  revision: number
  status: string
  changeSummary: string
  updatedAt: string
  updatedBy: string
  configuration: T
}

function actorName(actor: { name: string | null; email: string }) {
  return actor.name || actor.email
}

function paymentVersion(row: PaymentRow): NotificationConfigurationVersion<PaymentConfiguration> {
  return {
    id: row.configurationVersionId,
    versionNumber: row.version.versionNumber,
    revision: row.version.revision,
    status: row.version.status,
    changeSummary: row.version.changeSummary,
    updatedAt: row.version.updatedAt.toISOString(),
    updatedBy: actorName(row.version.updatedBy),
    configuration: {
      defaultMethod: row.defaultMethod,
      confirmationMode: row.confirmationMode,
      depositMode: row.depositType,
      depositValue: row.depositValue,
      remainingBalanceRule: row.remainingBalanceRule,
      methods: row.methods.map(({ method, enabled }) => ({ method, enabled })),
      instructions: row.instructions.map(({ method, locale, instructions }) => ({
        method,
        locale,
        instructions,
      })),
    },
  }
}

function confirmationVersion(
  row: ConfirmationRow,
): NotificationConfigurationVersion<ConfirmationConfiguration> {
  const enabled = new Map(row.sections.map(({ sectionDefinition, enabled }) => [sectionDefinition.key, enabled]))
  return {
    id: row.configurationVersionId,
    versionNumber: row.version.versionNumber,
    revision: row.version.revision,
    status: row.version.status,
    changeSummary: row.version.changeSummary,
    updatedAt: row.version.updatedAt.toISOString(),
    updatedBy: actorName(row.version.updatedBy),
    configuration: {
      sections: CONFIRMATION_SECTIONS.map((section) => ({ section, enabled: enabled.get(section) ?? false })),
      content: row.translations.map(({ locale, heading, safeContent }) => ({
        locale,
        heading: heading ?? undefined,
        safeContent: safeContent ?? undefined,
      })),
    },
  }
}

async function releaseRows(db: Prisma.TransactionClient | PrismaClient) {
  const [active, draft] = await Promise.all([
    db.businessConfigurationRelease.findFirst({ where: { status: "ACTIVE" }, orderBy: { activatedAt: "desc" } }),
    db.businessConfigurationRelease.findFirst({
      where: { status: { in: ["DRAFT", "VALIDATED"] } },
      orderBy: { updatedAt: "desc" },
    }),
  ])
  return { active, draft }
}

export async function loadNotificationConfigurationPage(db: PrismaClient = prisma) {
  const { active, draft } = await releaseRows(db)
  const ids = [
    active?.paymentConfigVersionId,
    active?.confirmationConfigVersionId,
    draft?.paymentConfigVersionId,
    draft?.confirmationConfigVersionId,
  ].filter((id): id is string => Boolean(id))
  const [payments, confirmations] = await Promise.all([
    db.paymentConfigVersion.findMany({ where: { configurationVersionId: { in: ids } }, include: paymentInclude }),
    db.confirmationConfigVersion.findMany({ where: { configurationVersionId: { in: ids } }, include: confirmationInclude }),
  ])
  const paymentById = new Map(payments.map((row) => [row.configurationVersionId, row]))
  const confirmationById = new Map(confirmations.map((row) => [row.configurationVersionId, row]))
  const draftPaymentRow = draft ? paymentById.get(draft.paymentConfigVersionId) : undefined
  const draftConfirmationRow = draft ? confirmationById.get(draft.confirmationConfigVersionId) : undefined
  const baseRelease = draft ?? active
  const general = baseRelease
    ? await db.generalRentalConfigVersion.findUnique({
        where: { configurationVersionId: baseRelease.generalRentalConfigVersionId },
        select: { supportedLocales: true },
      })
    : null
  return {
    supportedLocales: general?.supportedLocales.length ? general.supportedLocales : ["en", "de"],
    activePayment: active && paymentById.get(active.paymentConfigVersionId)
      ? paymentVersion(paymentById.get(active.paymentConfigVersionId)!)
      : undefined,
    activeConfirmation: active && confirmationById.get(active.confirmationConfigVersionId)
      ? confirmationVersion(confirmationById.get(active.confirmationConfigVersionId)!)
      : undefined,
    draftPayment:
      draftPaymentRow && ["DRAFT", "VALIDATED"].includes(draftPaymentRow.version.status)
        ? paymentVersion(draftPaymentRow)
        : undefined,
    draftConfirmation:
      draftConfirmationRow && ["DRAFT", "VALIDATED"].includes(draftConfirmationRow.version.status)
        ? confirmationVersion(draftConfirmationRow)
        : undefined,
    draftRelease: draft ? { id: draft.id, revision: draft.revision, releaseNumber: draft.releaseNumber } : undefined,
  }
}

async function requireCapability(db: Prisma.TransactionClient, actorId: string, capability: Capability) {
  if (!(await databaseUserHasCapability(db, actorId, capability)))
    throw new ConfigurationWorkflowError("CAPABILITY_REQUIRED", "Configuration edit capability is required.", "AUTHORIZATION")
}

async function audit(
  db: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetId: string,
  releaseId?: string,
) {
  await db.auditEvent.create({
    data: {
      actorUserId: actorId,
      category: "CONFIGURATION",
      action,
      targetType: "ConfigurationVersion",
      targetId,
      configurationReleaseId: releaseId,
    },
  })
}

async function clonePayment(db: Prisma.TransactionClient, sourceId: string, actorId: string, summary: string) {
  const source = await db.paymentConfigVersion.findUniqueOrThrow({
    where: { configurationVersionId: sourceId },
    include: { methods: true, instructions: true },
  })
  const maximum = await db.configurationVersion.aggregate({ where: { domain: "PAYMENTS" }, _max: { versionNumber: true } })
  return db.configurationVersion.create({
    data: {
      domain: "PAYMENTS",
      versionNumber: (maximum._max.versionNumber ?? 0) + 1,
      changeSummary: summary,
      createdById: actorId,
      updatedById: actorId,
      paymentRules: {
        create: {
          defaultMethod: source.defaultMethod,
          confirmationMode: source.confirmationMode,
          depositType: source.depositType,
          depositValue: source.depositValue,
          remainingBalanceRule: source.remainingBalanceRule,
          methods: { create: source.methods.map(({ method, enabled }) => ({ method, enabled })) },
          instructions: {
            create: source.instructions.map(({ method, locale, instructions }) => ({ method, locale, instructions })),
          },
        },
      },
    },
  })
}

async function cloneConfirmation(db: Prisma.TransactionClient, sourceId: string, actorId: string, summary: string) {
  const source = await db.confirmationConfigVersion.findUniqueOrThrow({
    where: { configurationVersionId: sourceId },
    include: { sections: true, translations: true },
  })
  const maximum = await db.configurationVersion.aggregate({ where: { domain: "CONFIRMATIONS" }, _max: { versionNumber: true } })
  return db.configurationVersion.create({
    data: {
      domain: "CONFIRMATIONS",
      versionNumber: (maximum._max.versionNumber ?? 0) + 1,
      changeSummary: summary,
      createdById: actorId,
      updatedById: actorId,
      confirmation: {
        create: {
          sections: {
            create: source.sections.map(({ sectionDefinitionId, enabled }) => ({ sectionDefinitionId, enabled })),
          },
          translations: {
            create: source.translations.map(({ locale, heading, safeContent }) => ({ locale, heading, safeContent })),
          },
        },
      },
    },
  })
}

export async function createNotificationConfigurationDraft(input: {
  actorId: string
  changeSummary: string
  db?: PrismaClient
}) {
  const client = input.db ?? prisma
  return client.$transaction(async (tx) => {
    await requireCapability(tx, input.actorId, CAPABILITIES.CONFIGURATION_EDIT)
    await requireCapability(tx, input.actorId, CAPABILITIES.PAYMENTS_MANAGE)
    await requireCapability(tx, input.actorId, CAPABILITIES.CONFIRMATIONS_MANAGE)
    const { active, draft: latestDraft } = await releaseRows(tx)
    const draft =
      latestDraft && (!active || latestDraft.supersedesReleaseId === active.id)
        ? latestDraft
        : null
    const base = draft ?? active
    if (!base)
      throw new ConfigurationWorkflowError("RELEASE_NOT_FOUND", "Create a base configuration release first.", "VALIDATION")
    const [paymentStatus, confirmationStatus] = await Promise.all([
      tx.configurationVersion.findUniqueOrThrow({ where: { id: base.paymentConfigVersionId }, select: { status: true } }),
      tx.configurationVersion.findUniqueOrThrow({ where: { id: base.confirmationConfigVersionId }, select: { status: true } }),
    ])
    const payment = ["DRAFT", "VALIDATED"].includes(paymentStatus.status)
      ? { id: base.paymentConfigVersionId }
      : await clonePayment(tx, base.paymentConfigVersionId, input.actorId, input.changeSummary)
    const confirmation = ["DRAFT", "VALIDATED"].includes(confirmationStatus.status)
      ? { id: base.confirmationConfigVersionId }
      : await cloneConfirmation(tx, base.confirmationConfigVersionId, input.actorId, input.changeSummary)
    let releaseId = draft?.id
    if (draft) {
      await tx.businessConfigurationRelease.update({
        where: { id: draft.id },
        data: {
          paymentConfigVersionId: payment.id,
          confirmationConfigVersionId: confirmation.id,
          status: "DRAFT",
          validationStatus: "NOT_VALIDATED",
          validationSnapshot: Prisma.JsonNull,
          changeSummary: input.changeSummary,
          updatedById: input.actorId,
          revision: { increment: 1 },
        },
      })
    } else {
      const maximum = await tx.businessConfigurationRelease.aggregate({ _max: { releaseNumber: true } })
      const created = await tx.businessConfigurationRelease.create({
        data: {
          releaseNumber: (maximum._max.releaseNumber ?? 0) + 1,
          name: `Notification configuration ${(maximum._max.releaseNumber ?? 0) + 1}`,
          changeSummary: input.changeSummary,
          generalRentalConfigVersionId: base.generalRentalConfigVersionId,
          pricingBillingConfigVersionId: base.pricingBillingConfigVersionId,
          fleetRateSetId: base.fleetRateSetId,
          insuranceConfigVersionId: base.insuranceConfigVersionId,
          customerDriverConfigVersionId: base.customerDriverConfigVersionId,
          bookingWorkflowConfigVersionId: base.bookingWorkflowConfigVersionId,
          documentPolicyConfigVersionId: base.documentPolicyConfigVersionId,
          paymentConfigVersionId: payment.id,
          confirmationConfigVersionId: confirmation.id,
          legalAcceptanceConfigVersionId: base.legalAcceptanceConfigVersionId,
          supersedesReleaseId: active?.id,
          createdById: input.actorId,
          updatedById: input.actorId,
        },
      })
      releaseId = created.id
    }
    await audit(tx, input.actorId, "notifications.drafts_created", payment.id, releaseId)
    await audit(tx, input.actorId, "confirmations.draft_created", confirmation.id, releaseId)
    return { paymentVersionId: payment.id, confirmationVersionId: confirmation.id, releaseId }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

async function lockVersion(
  tx: Prisma.TransactionClient,
  input: { id: string; domain: "PAYMENTS" | "CONFIRMATIONS"; revision: number; actorId: string; summary: string },
) {
  const locked = await tx.configurationVersion.updateMany({
    where: { id: input.id, domain: input.domain, revision: input.revision, status: { in: ["DRAFT", "VALIDATED"] } },
    data: {
      revision: { increment: 1 },
      status: "DRAFT",
      validationStatus: "NOT_VALIDATED",
      validationSnapshot: Prisma.JsonNull,
      changeSummary: input.summary,
      updatedById: input.actorId,
    },
  })
  if (locked.count !== 1)
    throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "The configuration draft changed. Reload and try again.", "CONFLICT")
}

export async function updatePaymentInstructionDraft(input: {
  actorId: string
  versionId: string
  expectedRevision: number
  changeSummary: string
  defaultMethod: ManualPaymentMethod
  enabledMethods: ManualPaymentMethod[]
  depositEnabled: boolean
  depositPercentage: number
  paymentProfile: {
    bankName: string
    accountName: string
    accountNumber: string
    swiftCode: string
    iban: string
    guaranteePercentage: number
  }
  instructions: Array<{ method: ManualPaymentMethod; locale: string; instructions: string }>
  db?: PrismaClient
}) {
  const client = input.db ?? prisma
  return client.$transaction(async (tx) => {
    await requireCapability(tx, input.actorId, CAPABILITIES.PAYMENTS_MANAGE)
    if (input.enabledMethods.includes("BANK_TRANSFER") || input.depositEnabled) {
      if (!input.paymentProfile.accountName.trim() || !input.paymentProfile.iban.trim()) {
        throw new ConfigurationWorkflowError(
          "RELEASE_INCOMPLETE",
          "Add a valid account holder and IBAN before enabling bank transfer.",
          "VALIDATION",
        )
      }
    }
    if (input.enabledMethods.includes("CASH_ON_PICKUP")) {
      const company = await tx.companySettings.findUnique({
        where: { id: "company-settings" },
        select: {
          companyName: true,
          companyEmail: true,
          companyPhone: true,
          companyAddress: true,
          companyCity: true,
          companyZipCode: true,
          companyCountry: true,
        },
      })
      if (
        !company?.companyName.trim() ||
        !company.companyEmail.trim() ||
        !company.companyPhone?.trim() ||
        !company.companyAddress?.trim() ||
        !company.companyCity?.trim() ||
        !company.companyZipCode?.trim() ||
        !company.companyCountry?.trim()
      ) {
        throw new ConfigurationWorkflowError(
          "RELEASE_INCOMPLETE",
          "Complete the company name, address, postal code, city, country, phone, and email before enabling payment at pickup.",
          "VALIDATION",
        )
      }
    }
    await lockVersion(tx, { id: input.versionId, domain: "PAYMENTS", revision: input.expectedRevision, actorId: input.actorId, summary: input.changeSummary })
    await tx.companySettings.upsert({
      where: { id: "company-settings" },
      update: {
        ...input.paymentProfile,
        iban: input.paymentProfile.iban.replace(/\s+/g, "").toUpperCase() || null,
      },
      create: {
        id: "company-settings",
        ...input.paymentProfile,
        iban: input.paymentProfile.iban.replace(/\s+/g, "").toUpperCase() || null,
      },
    })
    const depositValue = input.depositEnabled ? input.depositPercentage * 100 : 0
    const configuration: PaymentConfiguration = {
      defaultMethod: input.defaultMethod,
      confirmationMode: "REQUIRES_REVIEW",
      depositMode: input.depositEnabled ? "PERCENTAGE_BPS" : "NONE",
      depositValue,
      remainingBalanceRule: input.depositEnabled && depositValue < 10_000 ? "ON_PICKUP" : "NOT_APPLICABLE",
      methods: PAYMENT_METHODS.map((method) => ({ method, enabled: MANUAL_METHODS.includes(method as ManualPaymentMethod) && input.enabledMethods.includes(method as ManualPaymentMethod) })),
      instructions: input.instructions,
    }
    paymentConfigurationSchema.parse(configuration)
    await tx.paymentMethodRule.deleteMany({ where: { paymentConfigVersionId: input.versionId } })
    await tx.paymentInstructionTranslation.deleteMany({ where: { paymentConfigVersionId: input.versionId } })
    await tx.paymentConfigVersion.update({
      where: { configurationVersionId: input.versionId },
      data: {
        defaultMethod: input.defaultMethod,
        confirmationMode: "REQUIRES_REVIEW",
        depositType: configuration.depositMode,
        depositValue: configuration.depositValue,
        remainingBalanceRule: configuration.remainingBalanceRule,
        methods: { create: configuration.methods },
        instructions: { create: input.instructions },
      },
    })
    await audit(tx, input.actorId, "payments.instructions_updated", input.versionId)
    return { revision: input.expectedRevision + 1 }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function updateConfirmationContentDraft(input: {
  actorId: string
  versionId: string
  expectedRevision: number
  changeSummary: string
  configuration: ConfirmationConfiguration
  db?: PrismaClient
}) {
  const client = input.db ?? prisma
  return client.$transaction(async (tx) => {
    await requireCapability(tx, input.actorId, CAPABILITIES.CONFIRMATIONS_MANAGE)
    const configuration = confirmationConfigurationSchema.parse(input.configuration)
    await lockVersion(tx, { id: input.versionId, domain: "CONFIRMATIONS", revision: input.expectedRevision, actorId: input.actorId, summary: input.changeSummary })
    const definitions = await tx.confirmationSectionDefinition.findMany({ where: { key: { in: CONFIRMATION_SECTIONS as unknown as string[] } } })
    const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition.id]))
    if (definitions.length !== CONFIRMATION_SECTIONS.length)
      throw new ConfigurationWorkflowError("RELEASE_INCOMPLETE", "Confirmation section definitions are incomplete.", "VALIDATION")
    await tx.confirmationSectionRule.deleteMany({ where: { confirmationConfigVersionId: input.versionId } })
    await tx.confirmationContentTranslation.deleteMany({ where: { confirmationConfigVersionId: input.versionId } })
    await tx.confirmationConfigVersion.update({
      where: { configurationVersionId: input.versionId },
      data: {
        sections: { create: configuration.sections.map(({ section, enabled }) => ({ sectionDefinitionId: definitionByKey.get(section)!, enabled })) },
        translations: { create: configuration.content.map(({ locale, heading, safeContent }) => ({ locale, heading, safeContent })) },
      },
    })
    await audit(tx, input.actorId, "confirmations.content_updated", input.versionId)
    return { revision: input.expectedRevision + 1 }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
