import { Prisma, type PrismaClient } from "@prisma/client"
import { CAPABILITIES, type Capability } from "@/lib/authorization/capabilities"
import { databaseUserHasCapability } from "@/lib/authorization/database-capabilities"
import {
  PrismaBusinessConfigurationRepository,
  type ConfigurationDbClient,
} from "@/lib/business-configuration/prisma-repository"
import { ConfigurationWorkflowError } from "@/lib/business-configuration/workflow-errors"
import {
  BOOKING_STEPS,
  CUSTOMER_FIELDS,
  type BookingWorkflowConfiguration,
  type CustomerDriverRequirementsConfiguration,
  type InsuranceConfiguration,
} from "@/lib/business-configuration/domains"
import type { Phase6AdminPageData, Phase6Version } from "./types"

const userSelect = { name: true, email: true } as const
const actorName = (user: { name: string | null; email: string }) => user.name || user.email

async function requireCapability(db: ConfigurationDbClient, actorId: string, capability: Capability) {
  if (!(await databaseUserHasCapability(db, actorId, capability)))
    throw new ConfigurationWorkflowError(
      "CAPABILITY_REQUIRED",
      "Phase 6 configuration capability is required.",
      "AUTHORIZATION",
    )
}

async function requireAnyCapability(db: ConfigurationDbClient, actorId: string, capabilities: Capability[]) {
  const decisions = await Promise.all(
    capabilities.map((capability) => databaseUserHasCapability(db, actorId, capability)),
  )
  if (!decisions.some(Boolean))
    throw new ConfigurationWorkflowError(
      "CAPABILITY_REQUIRED",
      "Phase 6 configuration capability is required.",
      "AUTHORIZATION",
    )
}

async function audit(
  db: ConfigurationDbClient,
  input: {
    actorId: string
    action: string
    targetType: string
    targetId: string
    releaseId?: string
    before?: Prisma.InputJsonValue
    after?: Prisma.InputJsonValue
  },
) {
  try {
    await db.auditEvent.create({
      data: {
        actorUserId: input.actorId,
        category: "CONFIGURATION",
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        configurationReleaseId: input.releaseId,
        beforeSummary: input.before,
        afterSummary: input.after,
      },
    })
  } catch {
    throw new ConfigurationWorkflowError("AUDIT_WRITE_FAILED", "Configuration audit could not be saved.", "OPERATIONAL")
  }
}

function insuranceConfig(row: {
  requirementMode: string
  pricePerDay: number
  taxTreatment: string
  availabilityScope: string
  showInConfirmation: boolean
  showCustomerSelection: boolean
  preselectedByDefault: boolean
  translations: Array<{
    customerFacingName: string
    shortDescription: string | null
  }>
  vehicleAvailability: Array<{ carId: string; available: boolean }>
}): InsuranceConfiguration {
  const translation = row.translations[0]
  return {
    enabled: row.requirementMode !== "DISABLED",
    selectionMode: row.requirementMode === "MANDATORY" ? "MANDATORY" : "OPTIONAL",
    customerFacingName: translation?.customerFacingName ?? "Vollkasko",
    shortDescription: translation?.shortDescription ?? undefined,
    pricePerDay: row.pricePerDay,
    taxTreatment: row.taxTreatment as InsuranceConfiguration["taxTreatment"],
    availabilityScope: row.availabilityScope as InsuranceConfiguration["availabilityScope"],
    vehicleIds: row.vehicleAvailability.filter(({ available }) => available).map(({ carId }) => carId),
    showInConfirmation: row.showInConfirmation,
    showCustomerSelection: row.showCustomerSelection,
    preselectedByDefault: row.preselectedByDefault,
  }
}

function customerConfig(row: {
  minimumDriverAge: number
  maximumDriverAge: number | null
  minimumLicenceHeldMonths: number
  licenceMustCoverRentalEnd: boolean
  allowedLicenceCountries: string[]
  fieldRules: Array<{ field: string; mode: string }>
}): CustomerDriverRequirementsConfiguration {
  const modes = new Map(row.fieldRules.map(({ field, mode }) => [field, mode]))
  return {
    minimumDriverAge: row.minimumDriverAge,
    maximumDriverAge: row.maximumDriverAge ?? undefined,
    minimumLicenceHeldMonths: row.minimumLicenceHeldMonths,
    licenceMustCoverRentalEnd: row.licenceMustCoverRentalEnd,
    allowedLicenceCountries: row.allowedLicenceCountries,
    fields: Object.fromEntries(
      CUSTOMER_FIELDS.map((field) => [field, modes.get(field) ?? "DISABLED"]),
    ) as CustomerDriverRequirementsConfiguration["fields"],
  }
}

function workflowConfig(row: {
  stepRules: Array<{ step: string; mode: string; displayOrder: number }>
}): BookingWorkflowConfiguration {
  return {
    steps: row.stepRules.map(({ step, mode, displayOrder }) => ({
      step: step as BookingWorkflowConfiguration["steps"][number]["step"],
      requirement: mode as BookingWorkflowConfiguration["steps"][number]["requirement"],
      displayOrder,
    })),
  }
}

function version<T>(
  row: {
    id: string
    versionNumber: number
    revision: number
    status: string
    validationStatus: string
    changeSummary: string
    updatedAt: Date
    updatedBy: { name: string | null; email: string }
  },
  configuration: T,
): Phase6Version<T> {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    revision: row.revision,
    status: row.status,
    validationStatus: row.validationStatus,
    changeSummary: row.changeSummary,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: actorName(row.updatedBy),
    configuration,
  }
}

function releaseVersion<T>(
  row: {
    id: string
    versionNumber: number
    revision: number
    status: string
    validationStatus: string
    changeSummary: string
    updatedAt: string
    authorName: string
  },
  configuration: T,
): Phase6Version<T> {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    revision: row.revision,
    status: row.status,
    validationStatus: row.validationStatus,
    changeSummary: row.changeSummary,
    updatedAt: row.updatedAt,
    updatedBy: row.authorName,
    configuration,
  }
}

export class PrismaPhase6AdminRepository {
  constructor(readonly db: ConfigurationDbClient) {}

  async loadPageData(): Promise<Phase6AdminPageData> {
    const base = new PrismaBusinessConfigurationRepository(this.db)
    const [active, draftRelease, insuranceDraft] = await Promise.all([
      base.findActiveRelease(),
      base.findLatestDraftRelease(),
      this.db.configurationVersion.findFirst({
        where: { domain: "INSURANCE", status: { in: ["DRAFT", "VALIDATED"] } },
        include: {
          updatedBy: { select: userSelect },
          insurance: {
            include: {
              translations: { orderBy: { locale: "asc" } },
              vehicleAvailability: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
    ])
    // Bound read concurrency so this repository remains safe with small
    // serverless connection pools while preserving parallelism within batches.
    const [customerDraft, workflowDraft, vehicles] = await Promise.all([
      this.db.configurationVersion.findFirst({
        where: {
          domain: "CUSTOMER_DRIVER_REQUIREMENTS",
          status: { in: ["DRAFT", "VALIDATED"] },
        },
        include: {
          updatedBy: { select: userSelect },
          customerDriverRequirements: { include: { fieldRules: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      this.db.configurationVersion.findFirst({
        where: {
          domain: "BOOKING_WORKFLOW",
          status: { in: ["DRAFT", "VALIDATED"] },
        },
        include: {
          updatedBy: { select: userSelect },
          bookingWorkflow: { include: { stepRules: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      this.db.car.findMany({
        where: { isDeleted: false },
        select: { id: true, name: true, slug: true, status: true },
        orderBy: { name: "asc" },
      }),
    ])
    const settings = await this.db.companySettings.findUnique({
      where: { id: "company-settings" },
      select: { currency: true },
    })
    const liveInsurance = active ? releaseVersion(active.versions.insurance, active.domains.insurance!) : undefined
    const liveCustomer = active
      ? releaseVersion(active.versions["customer-driver-requirements"], active.domains["customer-driver-requirements"]!)
      : undefined
    const liveWorkflow = active
      ? releaseVersion(active.versions["booking-workflow"], active.domains["booking-workflow"]!)
      : undefined
    const mappedInsurance = insuranceDraft?.insurance
      ? version(insuranceDraft, insuranceConfig(insuranceDraft.insurance))
      : undefined
    const mappedCustomer = customerDraft?.customerDriverRequirements
      ? version(customerDraft, customerConfig(customerDraft.customerDriverRequirements))
      : undefined
    const mappedWorkflow = workflowDraft?.bookingWorkflow
      ? version(workflowDraft, workflowConfig(workflowDraft.bookingWorkflow))
      : undefined
    return {
      currency:
        draftRelease?.domains["general-rental"]?.currency ??
        active?.domains["general-rental"]?.currency ??
        settings?.currency ??
        "EUR",
      activeRelease: active ? { id: active.id, releaseNumber: active.releaseNumber } : undefined,
      draftRelease: draftRelease
        ? {
            id: draftRelease.id,
            releaseNumber: draftRelease.releaseNumber,
            revision: draftRelease.revision,
          }
        : undefined,
      liveInsurance,
      draftInsurance: mappedInsurance,
      liveCustomerDriver: liveCustomer,
      draftCustomerDriver: mappedCustomer,
      liveWorkflow,
      draftWorkflow: mappedWorkflow,
      vehicles: vehicles.map((car) => ({
        ...car,
        activeForBooking: car.status === "AVAILABLE" || car.status === "LOW_STOCK",
      })),
      issues: [],
      attached: {
        insurance: Boolean(
          draftRelease && mappedInsurance && draftRelease.versions.insurance.id === mappedInsurance.id,
        ),
        customerDriver: Boolean(
          draftRelease &&
          mappedCustomer &&
          draftRelease.versions["customer-driver-requirements"].id === mappedCustomer.id,
        ),
        workflow: Boolean(
          draftRelease && mappedWorkflow && draftRelease.versions["booking-workflow"].id === mappedWorkflow.id,
        ),
      },
    }
  }

  async createDraft(input: {
    actorId: string
    domain: "INSURANCE" | "CUSTOMER_DRIVER_REQUIREMENTS" | "BOOKING_WORKFLOW"
    source: "LIVE" | "DEFAULT"
    changeSummary: string
    client: PrismaClient
  }) {
    const capability =
      input.domain === "INSURANCE"
        ? CAPABILITIES.INSURANCE_MANAGE
        : input.domain === "CUSTOMER_DRIVER_REQUIREMENTS"
          ? CAPABILITIES.CONFIGURATION_EDIT
          : CAPABILITIES.BOOKING_WORKFLOW_MANAGE
    return input.client.$transaction(
      async (tx) => {
        if (input.domain === "CUSTOMER_DRIVER_REQUIREMENTS") {
          await requireAnyCapability(tx, input.actorId, [
            CAPABILITIES.DRIVER_REQUIREMENTS_MANAGE,
            CAPABILITIES.CUSTOMER_FIELDS_MANAGE,
            CAPABILITIES.CONFIGURATION_EDIT,
          ])
        } else {
          await requireCapability(tx, input.actorId, capability)
        }
        const existing = await tx.configurationVersion.findFirst({
          where: {
            domain: input.domain,
            status: { in: ["DRAFT", "VALIDATED"] },
          },
        })
        if (existing) return existing.id
        const page = await new PrismaPhase6AdminRepository(tx).loadPageData()
        const next =
          (
            await tx.configurationVersion.aggregate({
              where: { domain: input.domain },
              _max: { versionNumber: true },
            })
          )._max.versionNumber ?? 0
        const common = {
          domain: input.domain,
          versionNumber: next + 1,
          changeSummary: input.changeSummary,
          createdById: input.actorId,
          updatedById: input.actorId,
        }
        let created
        if (input.domain === "INSURANCE") {
          const source = input.source === "LIVE" ? page.liveInsurance?.configuration : undefined
          const config: InsuranceConfiguration = source ?? {
            enabled: false,
            customerFacingName: "Vollkasko",
            shortDescription: "Optional full insurance for the rental period.",
            selectionMode: "OPTIONAL",
            pricePerDay: 0,
            taxTreatment: "INHERIT_RENTAL",
            availabilityScope: "ALL_VEHICLES",
            vehicleIds: [],
            showInConfirmation: true,
            showCustomerSelection: false,
            preselectedByDefault: false,
          }
          created = await tx.configurationVersion.create({
            data: {
              ...common,
              insurance: {
                create: {
                  requirementMode: config.enabled ? config.selectionMode : "DISABLED",
                  pricePerDay: config.pricePerDay,
                  taxTreatment: config.taxTreatment,
                  availabilityScope: config.availabilityScope,
                  showInConfirmation: config.showInConfirmation,
                  showCustomerSelection: config.showCustomerSelection,
                  preselectedByDefault: config.preselectedByDefault,
                  translations: {
                    create: {
                      locale: "en",
                      customerFacingName: config.customerFacingName,
                      shortDescription: config.shortDescription,
                    },
                  },
                  vehicleAvailability: {
                    create:
                      config.availabilityScope === "SELECTED_VEHICLES"
                        ? config.vehicleIds.map((carId) => ({
                            carId,
                            available: true,
                          }))
                        : [],
                  },
                },
              },
            },
          })
        } else if (input.domain === "CUSTOMER_DRIVER_REQUIREMENTS") {
          const source = input.source === "LIVE" ? page.liveCustomerDriver?.configuration : undefined
          const fields = Object.fromEntries(
            CUSTOMER_FIELDS.map((field) => [
              field,
              [
                "FIRST_NAME",
                "LAST_NAME",
                "EMAIL",
                "DATE_OF_BIRTH",
                "LICENCE_NUMBER",
                "LICENCE_ISSUE_DATE",
                "LICENCE_EXPIRY_DATE",
                "LICENCE_ISSUING_COUNTRY",
              ].includes(field)
                ? "REQUIRED"
                : "OPTIONAL",
            ]),
          ) as CustomerDriverRequirementsConfiguration["fields"]
          const config = source ?? {
            minimumDriverAge: 18,
            minimumLicenceHeldMonths: 0,
            licenceMustCoverRentalEnd: true,
            allowedLicenceCountries: [],
            fields,
          }
          created = await tx.configurationVersion.create({
            data: {
              ...common,
              customerDriverRequirements: {
                create: {
                  minimumDriverAge: config.minimumDriverAge,
                  maximumDriverAge: config.maximumDriverAge,
                  minimumLicenceHeldMonths: config.minimumLicenceHeldMonths,
                  licenceMustCoverRentalEnd: config.licenceMustCoverRentalEnd,
                  allowedLicenceCountries: config.allowedLicenceCountries,
                  fieldRules: {
                    create: CUSTOMER_FIELDS.map((field) => ({
                      field,
                      mode: config.fields[field],
                    })),
                  },
                },
              },
            },
          })
        } else {
          const source = input.source === "LIVE" ? page.liveWorkflow?.configuration : undefined
          const config = source ?? {
            steps: BOOKING_STEPS.map((step, displayOrder) => ({
              step,
              displayOrder,
              requirement: (["DOCUMENTS", "LEGAL_ACCEPTANCE", "INSURANCE"] as string[]).includes(step)
                ? ("HIDDEN" as const)
                : ("REQUIRED" as const),
            })),
          }
          created = await tx.configurationVersion.create({
            data: {
              ...common,
              bookingWorkflow: {
                create: {
                  stepRules: {
                    create: config.steps.map(({ step, requirement, displayOrder }) => ({
                      step,
                      mode: requirement,
                      displayOrder,
                    })),
                  },
                },
              },
            },
          })
        }
        await audit(tx, {
          actorId: input.actorId,
          action: `${input.domain.toLowerCase()}.draft_created`,
          targetType: "ConfigurationVersion",
          targetId: created.id,
          after: {
            domain: input.domain,
            versionNumber: next + 1,
            source: input.source,
          },
        })
        return created.id
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async discardDraft(input: {
    actorId: string
    domain: "INSURANCE" | "CUSTOMER_DRIVER_REQUIREMENTS" | "BOOKING_WORKFLOW"
    versionId: string
    expectedRevision: number
    client: PrismaClient
  }) {
    return input.client.$transaction(
      async (tx) => {
        const capabilities =
          input.domain === "INSURANCE"
            ? [CAPABILITIES.INSURANCE_MANAGE]
            : input.domain === "CUSTOMER_DRIVER_REQUIREMENTS"
              ? [CAPABILITIES.DRIVER_REQUIREMENTS_MANAGE, CAPABILITIES.CUSTOMER_FIELDS_MANAGE]
              : [CAPABILITIES.BOOKING_WORKFLOW_MANAGE]
        await requireAnyCapability(tx, input.actorId, capabilities)
        const draft = await tx.configurationVersion.findFirst({
          where: {
            id: input.versionId,
            domain: input.domain,
            revision: input.expectedRevision,
            status: { in: ["DRAFT", "VALIDATED"] },
          },
        })
        if (!draft)
          throw new ConfigurationWorkflowError(
            "OPTIMISTIC_LOCK_FAILED",
            "The draft changed before it could be discarded.",
            "CONFLICT",
          )
        const active = await tx.businessConfigurationRelease.findFirst({
          where: { status: "ACTIVE" },
        })
        const attachedWhere =
          input.domain === "INSURANCE"
            ? { insuranceConfigVersionId: input.versionId }
            : input.domain === "CUSTOMER_DRIVER_REQUIREMENTS"
              ? { customerDriverConfigVersionId: input.versionId }
              : { bookingWorkflowConfigVersionId: input.versionId }
        const attached = await tx.businessConfigurationRelease.count({
          where: { ...attachedWhere, status: { in: ["DRAFT", "VALIDATED"] } },
        })
        if (attached && !active)
          throw new ConfigurationWorkflowError(
            "RELEASE_INCOMPLETE",
            "An attached initial draft cannot be discarded until a live version exists.",
            "VALIDATION",
          )
        if (attached && active) {
          const data =
            input.domain === "INSURANCE"
              ? { insuranceConfigVersionId: active.insuranceConfigVersionId }
              : input.domain === "CUSTOMER_DRIVER_REQUIREMENTS"
                ? {
                    customerDriverConfigVersionId: active.customerDriverConfigVersionId,
                  }
                : {
                    bookingWorkflowConfigVersionId: active.bookingWorkflowConfigVersionId,
                  }
          await tx.businessConfigurationRelease.updateMany({
            where: { ...attachedWhere, status: { in: ["DRAFT", "VALIDATED"] } },
            data: {
              ...data,
              status: "DRAFT",
              validationStatus: "NOT_VALIDATED",
              validationSnapshot: Prisma.JsonNull,
              revision: { increment: 1 },
              updatedById: input.actorId,
            },
          })
        }
        if (input.domain === "INSURANCE")
          await tx.insuranceConfigVersion.delete({
            where: { configurationVersionId: input.versionId },
          })
        else if (input.domain === "CUSTOMER_DRIVER_REQUIREMENTS")
          await tx.customerDriverConfigVersion.delete({
            where: { configurationVersionId: input.versionId },
          })
        else
          await tx.bookingWorkflowConfigVersion.delete({
            where: { configurationVersionId: input.versionId },
          })
        await tx.configurationVersion.delete({
          where: { id: input.versionId },
        })
        await audit(tx, {
          actorId: input.actorId,
          action: `${input.domain.toLowerCase()}.draft_discarded`,
          targetType: "ConfigurationVersion",
          targetId: input.versionId,
          before: {
            versionNumber: draft.versionNumber,
            revision: draft.revision,
          },
        })
        return { discarded: input.versionId }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async updateInsurance(input: {
    actorId: string
    versionId: string
    expectedRevision: number
    configuration: InsuranceConfiguration
    changeSummary: string
    client: PrismaClient
  }) {
    return input.client.$transaction(
      async (tx) => {
        await requireCapability(tx, input.actorId, CAPABILITIES.INSURANCE_MANAGE)
        const locked = await tx.configurationVersion.updateMany({
          where: {
            id: input.versionId,
            domain: "INSURANCE",
            revision: input.expectedRevision,
            status: { in: ["DRAFT", "VALIDATED"] },
          },
          data: {
            revision: { increment: 1 },
            status: "DRAFT",
            validationStatus: "NOT_VALIDATED",
            validationSnapshot: Prisma.JsonNull,
            changeSummary: input.changeSummary,
            updatedById: input.actorId,
          },
        })
        if (locked.count !== 1)
          throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Insurance draft changed.", "CONFLICT")
        const config = input.configuration
        await tx.insuranceConfigVersion.update({
          where: { configurationVersionId: input.versionId },
          data: {
            requirementMode: config.enabled ? config.selectionMode : "DISABLED",
            pricePerDay: config.pricePerDay,
            taxTreatment: config.taxTreatment,
            availabilityScope: config.availabilityScope,
            showInConfirmation: config.showInConfirmation,
            showCustomerSelection: config.showCustomerSelection,
            preselectedByDefault: config.preselectedByDefault,
          },
        })
        await tx.insuranceConfigTranslation.deleteMany({
          where: { insuranceConfigVersionId: input.versionId },
        })
        await tx.insuranceConfigTranslation.create({
          data: {
            insuranceConfigVersionId: input.versionId,
            locale: "en",
            customerFacingName: config.customerFacingName,
            shortDescription: config.shortDescription,
          },
        })
        await tx.insuranceVehicleAvailability.deleteMany({
          where: { insuranceConfigVersionId: input.versionId },
        })
        if (config.availabilityScope === "SELECTED_VEHICLES")
          await tx.insuranceVehicleAvailability.createMany({
            data: config.vehicleIds.map((carId) => ({
              insuranceConfigVersionId: input.versionId,
              carId,
              available: true,
            })),
          })
        await audit(tx, {
          actorId: input.actorId,
          action: "insurance.settings_changed",
          targetType: "ConfigurationVersion",
          targetId: input.versionId,
          before: { revision: input.expectedRevision },
          after: {
            revision: input.expectedRevision + 1,
            enabled: config.enabled,
            mode: config.selectionMode,
            availabilityScope: config.availabilityScope,
            affectedVehicleCount: config.vehicleIds.length,
            changedFields: [
              "requirementMode",
              "pricePerDay",
              "taxTreatment",
              "availabilityScope",
              "selection",
              "confirmation",
            ],
          },
        })
        return { revision: input.expectedRevision + 1 }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async updateCustomerDriver(input: {
    actorId: string
    capability: Capability
    versionId: string
    expectedRevision: number
    configuration: CustomerDriverRequirementsConfiguration
    changeSummary: string
    action: string
    client: PrismaClient
  }) {
    return input.client.$transaction(
      async (tx) => {
        await requireCapability(tx, input.actorId, input.capability)
        const locked = await tx.configurationVersion.updateMany({
          where: {
            id: input.versionId,
            domain: "CUSTOMER_DRIVER_REQUIREMENTS",
            revision: input.expectedRevision,
            status: { in: ["DRAFT", "VALIDATED"] },
          },
          data: {
            revision: { increment: 1 },
            status: "DRAFT",
            validationStatus: "NOT_VALIDATED",
            validationSnapshot: Prisma.JsonNull,
            changeSummary: input.changeSummary,
            updatedById: input.actorId,
          },
        })
        if (locked.count !== 1)
          throw new ConfigurationWorkflowError(
            "OPTIMISTIC_LOCK_FAILED",
            "Customer and driver draft changed.",
            "CONFLICT",
          )
        const config = input.configuration
        await tx.customerDriverConfigVersion.update({
          where: { configurationVersionId: input.versionId },
          data: {
            minimumDriverAge: config.minimumDriverAge,
            maximumDriverAge: config.maximumDriverAge,
            minimumLicenceHeldMonths: config.minimumLicenceHeldMonths,
            licenceMustCoverRentalEnd: config.licenceMustCoverRentalEnd,
            allowedLicenceCountries: config.allowedLicenceCountries,
          },
        })
        await tx.customerFieldRule.deleteMany({
          where: { customerDriverConfigVersionId: input.versionId },
        })
        await tx.customerFieldRule.createMany({
          data: CUSTOMER_FIELDS.map((field) => ({
            customerDriverConfigVersionId: input.versionId,
            field,
            mode: config.fields[field],
          })),
        })
        await audit(tx, {
          actorId: input.actorId,
          action: input.action,
          targetType: "ConfigurationVersion",
          targetId: input.versionId,
          before: { revision: input.expectedRevision },
          after: {
            revision: input.expectedRevision + 1,
            changedFields:
              input.action === "driver.requirements_changed"
                ? ["age", "licenceHolding", "licenceValidity", "countries"]
                : ["fieldModes"],
            requiredFieldCount: Object.values(config.fields).filter((mode) => mode === "REQUIRED").length,
          },
        })
        return { revision: input.expectedRevision + 1 }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async updateWorkflow(input: {
    actorId: string
    versionId: string
    expectedRevision: number
    configuration: BookingWorkflowConfiguration
    changeSummary: string
    client: PrismaClient
  }) {
    return input.client.$transaction(
      async (tx) => {
        await requireCapability(tx, input.actorId, CAPABILITIES.BOOKING_WORKFLOW_MANAGE)
        const locked = await tx.configurationVersion.updateMany({
          where: {
            id: input.versionId,
            domain: "BOOKING_WORKFLOW",
            revision: input.expectedRevision,
            status: { in: ["DRAFT", "VALIDATED"] },
          },
          data: {
            revision: { increment: 1 },
            status: "DRAFT",
            validationStatus: "NOT_VALIDATED",
            validationSnapshot: Prisma.JsonNull,
            changeSummary: input.changeSummary,
            updatedById: input.actorId,
          },
        })
        if (locked.count !== 1)
          throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Booking workflow draft changed.", "CONFLICT")
        await tx.bookingStepRule.deleteMany({
          where: { bookingWorkflowConfigVersionId: input.versionId },
        })
        await tx.bookingStepRule.createMany({
          data: input.configuration.steps.map(({ step, requirement, displayOrder }) => ({
            bookingWorkflowConfigVersionId: input.versionId,
            step,
            mode: requirement,
            displayOrder,
          })),
        })
        await audit(tx, {
          actorId: input.actorId,
          action: "booking_workflow.step_modes_changed",
          targetType: "ConfigurationVersion",
          targetId: input.versionId,
          before: { revision: input.expectedRevision },
          after: {
            revision: input.expectedRevision + 1,
            changedFields: ["stepModes", "displayOrder"],
          },
        })
        return { revision: input.expectedRevision + 1 }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async attachDrafts(input: { actorId: string; expectedReleaseRevision?: number; client: PrismaClient }) {
    return input.client.$transaction(
      async (tx) => {
        await requireCapability(tx, input.actorId, CAPABILITIES.CONFIGURATION_EDIT)
        const page = await new PrismaPhase6AdminRepository(tx).loadPageData()
        if (!page.draftInsurance || !page.draftCustomerDriver || !page.draftWorkflow)
          throw new ConfigurationWorkflowError(
            "RELEASE_INCOMPLETE",
            "Create all Phase 6 drafts before attaching them.",
            "VALIDATION",
          )
        const draft = await tx.businessConfigurationRelease.findFirst({
          where: { status: { in: ["DRAFT", "VALIDATED"] } },
          orderBy: { updatedAt: "desc" },
        })
        let releaseId
        if (draft) {
          if (input.expectedReleaseRevision !== undefined && draft.revision !== input.expectedReleaseRevision)
            throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Release draft changed.", "CONFLICT")
          const updated = await tx.businessConfigurationRelease.updateMany({
            where: { id: draft.id, revision: draft.revision },
            data: {
              insuranceConfigVersionId: page.draftInsurance.id,
              customerDriverConfigVersionId: page.draftCustomerDriver.id,
              bookingWorkflowConfigVersionId: page.draftWorkflow.id,
              status: "DRAFT",
              validationStatus: "NOT_VALIDATED",
              validationSnapshot: Prisma.JsonNull,
              revision: { increment: 1 },
              updatedById: input.actorId,
            },
          })
          if (updated.count !== 1)
            throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Release draft changed.", "CONFLICT")
          releaseId = draft.id
        } else {
          const active = await tx.businessConfigurationRelease.findFirst({
            where: { status: "ACTIVE" },
          })
          if (!active)
            throw new ConfigurationWorkflowError(
              "RELEASE_INCOMPLETE",
              "A complete active release is required as the base.",
              "VALIDATION",
            )
          const next =
            (
              await tx.businessConfigurationRelease.aggregate({
                _max: { releaseNumber: true },
              })
            )._max.releaseNumber ?? 0
          const created = await tx.businessConfigurationRelease.create({
            data: {
              releaseNumber: next + 1,
              name: `Booking experience update ${next + 1}`,
              changeSummary: "Insurance, driver, customer, and booking flow update",
              generalRentalConfigVersionId: active.generalRentalConfigVersionId,
              pricingBillingConfigVersionId: active.pricingBillingConfigVersionId,
              fleetRateSetId: active.fleetRateSetId,
              insuranceConfigVersionId: page.draftInsurance.id,
              customerDriverConfigVersionId: page.draftCustomerDriver.id,
              bookingWorkflowConfigVersionId: page.draftWorkflow.id,
              documentPolicyConfigVersionId: active.documentPolicyConfigVersionId,
              paymentConfigVersionId: active.paymentConfigVersionId,
              confirmationConfigVersionId: active.confirmationConfigVersionId,
              legalAcceptanceConfigVersionId: active.legalAcceptanceConfigVersionId,
              supersedesReleaseId: active.id,
              createdById: input.actorId,
              updatedById: input.actorId,
            },
          })
          releaseId = created.id
        }
        await audit(tx, {
          actorId: input.actorId,
          action: "phase6.drafts_attached_to_release",
          targetType: "BusinessConfigurationRelease",
          targetId: releaseId,
          releaseId,
          after: {
            insuranceVersionId: page.draftInsurance.id,
            customerDriverVersionId: page.draftCustomerDriver.id,
            workflowVersionId: page.draftWorkflow.id,
          },
        })
        return { releaseId }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async persistValidation(input: {
    actorId: string
    versions: Array<{
      id: string
      revision: number
      outcome: "VALID" | "WARNING" | "BLOCKED"
      issues: Prisma.InputJsonValue
    }>
    client: PrismaClient
  }) {
    return input.client.$transaction(
      async (tx) => {
        await requireCapability(tx, input.actorId, CAPABILITIES.CONFIGURATION_VALIDATE)
        const now = new Date()
        for (const version of input.versions) {
          const updated = await tx.configurationVersion.updateMany({
            where: {
              id: version.id,
              revision: version.revision,
              status: { in: ["DRAFT", "VALIDATED"] },
            },
            data: {
              revision: { increment: 1 },
              status: version.outcome === "BLOCKED" ? "DRAFT" : "VALIDATED",
              validationStatus: version.outcome,
              validationSnapshot: version.issues,
              validatedById: input.actorId,
              validatedAt: now,
              updatedById: input.actorId,
            },
          })
          if (updated.count !== 1)
            throw new ConfigurationWorkflowError(
              "OPTIMISTIC_LOCK_FAILED",
              "A Phase 6 draft changed during validation.",
              "CONFLICT",
            )
          await audit(tx, {
            actorId: input.actorId,
            action: "phase6.domain_validated",
            targetType: "ConfigurationVersion",
            targetId: version.id,
            after: { outcome: version.outcome },
          })
        }
        return { validated: input.versions.length }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }
}
