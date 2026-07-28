"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { createCarSchema, updateCarSchema } from "@/lib/validations"
import { getUnavailableDates, isCarAvailable } from "@/lib/availability"
import {
  createCarSlugBase,
  getNextCarSlug,
  isSlugUniqueConstraintError,
} from "@/lib/cars/slug"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prepareOwnerPricingEdit } from "@/lib/admin/owner-settings-edit"
import { newCarPublishingMode } from "@/lib/admin/new-car-publishing"
import { activateDraftRelease, validateDraftRelease } from "@/lib/business-configuration/workflow-service"
import { getHandoverEvents } from "@/lib/handover-capacity"

const MAX_CAR_SLUG_CREATE_ATTEMPTS = 10

export async function createCar(data: unknown) {
  try {
    const admin = await requireAdmin()

    const [activeRelease, pendingRelease] = await Promise.all([
      prisma.businessConfigurationRelease.findFirst({ where: { status: "ACTIVE" }, select: { id: true } }),
      prisma.businessConfigurationRelease.findFirst({
        where: { status: { in: ["DRAFT", "VALIDATED"] } },
        select: { id: true },
      }),
    ])
    const publishingMode = newCarPublishingMode({
      hasActiveRelease: Boolean(activeRelease),
      hasPendingRelease: Boolean(pendingRelease),
    })

    // Validate input
    const validated = createCarSchema.parse(data)

    const slugBase = createCarSlugBase(validated.name)
    const matchingSlugs = await prisma.car.findMany({
      where: {
        OR: [{ slug: slugBase }, { slug: { startsWith: `${slugBase}-` } }],
      },
      select: { slug: true },
    })
    const reservedSlugs = new Set(matchingSlugs.map(({ slug }) => slug))

    const createCarRecord = (carSlug: string) => prisma.$transaction(async (tx) => {
      const car = await tx.car.create({
        data: {
          slug: carSlug,
          name: validated.name,
          nameDe: validated.nameDe,
          subtitle: validated.subtitle,
          subtitleDe: validated.subtitleDe,
          description: validated.description,
          descriptionDe: validated.descriptionDe,
          category: validated.category,
          price: validated.price,
          image: validated.image,
          images: validated.images || [],
          status: validated.status,
          gearbox: validated.gearbox,
          seats: validated.seats,
          fuelType: validated.fuelType,
          acceleration: validated.acceleration,
          year: validated.year,
        },
      })

      const fleetDraft = await tx.fleetRateSet.findFirst({
        where: { status: { in: ["DRAFT", "VALIDATED"] } },
        orderBy: { updatedAt: "desc" },
      })
      if (fleetDraft) {
        await tx.vehicleRentalRate.upsert({
          where: { fleetRateSetId_carId: { fleetRateSetId: fleetDraft.id, carId: car.id } },
          create: { fleetRateSetId: fleetDraft.id, carId: car.id, dailyRate: car.price },
          update: { dailyRate: car.price },
        })
        await tx.fleetRateSet.update({
          where: { id: fleetDraft.id },
          data: {
            revision: { increment: 1 },
            status: "DRAFT",
            validationStatus: "NOT_VALIDATED",
            validationSnapshot: Prisma.JsonNull,
            updatedById: admin.id,
          },
        })
      }

      await tx.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "CAR_CREATED",
          targetType: "car",
          targetId: car.id,
          newValue: validated,
        },
      })
      if (fleetDraft) {
        await tx.auditEvent.create({
          data: {
            actorUserId: admin.id,
            category: "PRICING",
            action: "pricing.new_car_inherited_business_rules",
            targetType: "VehicleRentalRate",
            targetId: car.id,
            afterSummary: { fleetRateSetId: fleetDraft.id, dailyRate: car.price },
          },
        })
      }
      return { car, inheritedSetup: Boolean(fleetDraft) }
    })

    let createdResult: Awaited<ReturnType<typeof createCarRecord>> | undefined
    let lastSlugConflict: unknown

    for (let attempt = 0; attempt < MAX_CAR_SLUG_CREATE_ATTEMPTS; attempt += 1) {
      const candidateSlug = getNextCarSlug(slugBase, reservedSlugs)

      try {
        createdResult = await createCarRecord(candidateSlug)
        break
      } catch (error) {
        if (!isSlugUniqueConstraintError(error)) {
          throw error
        }

        lastSlugConflict = error
        reservedSlugs.add(candidateSlug)
      }
    }

    if (!createdResult) {
      throw lastSlugConflict ?? new Error("Unable to allocate a unique car URL")
    }

    const { car, inheritedSetup } = createdResult
    let bookingStatus: "ACTIVE" | "PENDING_REVIEW" | "SETUP_DRAFT" | "PRICING_ATTENTION" =
      publishingMode === "AUTO_PUBLISH" ? "PRICING_ATTENTION" : publishingMode

    try {
      const pricing = await prepareOwnerPricingEdit(admin.id)
      if (!pricing.draftRelease || !pricing.vehicles.some((vehicle) => vehicle.vehicleId === car.id && vehicle.draftRateId)) {
        throw new Error("The new car was not attached to the pricing draft.")
      }

      if (publishingMode === "AUTO_PUBLISH") {
        const validation = await validateDraftRelease(pricing.draftRelease.id, admin.id)
        const blockers = validation.result.issues.filter(({ severity }) => severity === "BLOCKER")
        if (blockers.length === 0) {
          const current = await prisma.businessConfigurationRelease.findUniqueOrThrow({
            where: { id: pricing.draftRelease.id },
            select: { revision: true },
          })
          await activateDraftRelease({
            releaseId: pricing.draftRelease.id,
            expectedRevision: current.revision,
            actorId: admin.id,
            warningsAcknowledged: true,
          })
          bookingStatus = "ACTIVE"
        }
      }
    } catch (setupError) {
      console.error("[CREATE_CAR_PRICING_SETUP_ERROR]", {
        carId: car.id,
        name: setupError instanceof Error ? setupError.name : "Unknown",
      })
      bookingStatus = "PRICING_ATTENTION"
    }

    revalidatePath("/")
    revalidatePath("/admin")
    revalidatePath("/admin/cars/pricing")
    revalidatePath("/admin/advanced/configuration")

    return { success: true, car, inheritedSetup, bookingStatus }
  } catch (error) {
    console.error("[CREATE_CAR_ERROR]", error)

    // Handle Zod validation errors with detailed, user-friendly messages
    if (error instanceof z.ZodError) {
      const fieldNames: Record<string, string> = {
        name: "Car Name (English)",
        nameDe: "Car Name (German)",
        subtitle: "Subtitle (English)",
        subtitleDe: "Subtitle (German)",
        description: "Description (English)",
        descriptionDe: "Description (German)",
        category: "Category",
        price: "Price per Day",
        image: "Main Image URL",
        images: "Gallery Images",
        status: "Status",
        gearbox: "Gearbox",
        seats: "Seats",
        fuelType: "Fuel Type",
        acceleration: "Acceleration (0-60 mph)",
        year: "Year",
      }

      const formattedErrors = error.errors.map((err) => {
        const fieldName = fieldNames[err.path[0] as string] || err.path[0]
        let message = err.message

        // Improve common error messages using switch to avoid type narrowing issues
        switch (err.code) {
          case "too_small":
            if (err.type === "string") {
              if (err.path[0] === "description" || err.path[0] === "descriptionDe") {
                message = `must be at least ${err.minimum} characters long`
              } else {
                message = `is required`
              }
            } else if (err.type === "number") {
              if (err.path[0] === "price") {
                message = `must be greater than 0`
              } else if (err.path[0] === "seats") {
                message = `must be between 2 and 9`
              } else if (err.path[0] === "year") {
                message = `must be between 1900 and 2030`
              } else {
                message = `must be at least ${err.minimum}`
              }
            }
            break
          case "too_big":
            if (err.type === "number") {
              if (err.path[0] === "seats") {
                message = `must be between 2 and 9`
              } else if (err.path[0] === "year") {
                message = `must be between 1900 and 2030`
              } else {
                message = `must not exceed ${err.maximum}`
              }
            } else if (err.type === "string") {
              message = `must not exceed ${err.maximum} characters`
            }
            break
          case "invalid_type":
            message = `has an invalid value`
            break
          case "invalid_string":
            if (err.validation === "url") {
              message = `must be a valid URL starting with http:// or https://`
            }
            break
          case "invalid_enum_value":
            message = `has an invalid value. Please select from the available options.`
            break
        }

        return `${fieldName}: ${message}`
      })

      return {
        error: "Validation failed",
        validationErrors: formattedErrors,
      }
    }

    if (isSlugUniqueConstraintError(error)) {
      return {
        error: "We could not create a unique page for this car. Please try again.",
      }
    }

    return { error: "The car could not be added. Please try again." }
  }
}

export async function updateCar(carId: string, data: unknown) {
  try {
    const admin = await requireAdmin()

    // Validate input
    const validated = updateCarSchema.parse(data)

    const existingCar = await prisma.car.findUnique({
      where: { id: carId },
    })

    if (!existingCar) {
      return { error: "Car not found" }
    }

    const car = await prisma.car.update({
      where: { id: carId },
      data: validated,
    })

    if (validated.price !== undefined) {
      const fleetDraft = await prisma.fleetRateSet.findFirst({
        where: { status: { in: ["DRAFT", "VALIDATED"] } },
        orderBy: { updatedAt: "desc" },
      })
      if (fleetDraft) {
        await prisma.$transaction([
          prisma.vehicleRentalRate.upsert({
            where: { fleetRateSetId_carId: { fleetRateSetId: fleetDraft.id, carId } },
            create: { fleetRateSetId: fleetDraft.id, carId, dailyRate: validated.price },
            update: { dailyRate: validated.price },
          }),
          prisma.fleetRateSet.update({
            where: { id: fleetDraft.id },
            data: {
              revision: { increment: 1 },
              status: "DRAFT",
              validationStatus: "NOT_VALIDATED",
              validationSnapshot: Prisma.JsonNull,
              updatedById: admin.id,
            },
          }),
        ])
      }
    }

    // Create audit log
    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "CAR_UPDATED",
        targetType: "car",
        targetId: carId,
        oldValue: existingCar,
        newValue: validated,
      },
    })

    revalidatePath("/")
    revalidatePath("/admin")
    revalidatePath(`/cars/${carId}`)
    revalidatePath("/admin/cars/pricing")
    revalidatePath("/admin/advanced/configuration")

    return { success: true, car }
  } catch (error) {
    console.error("[UPDATE_CAR_ERROR]", error)

    // Handle Zod validation errors with detailed, user-friendly messages
    if (error instanceof z.ZodError) {
      const fieldNames: Record<string, string> = {
        name: "Car Name (English)",
        nameDe: "Car Name (German)",
        subtitle: "Subtitle (English)",
        subtitleDe: "Subtitle (German)",
        description: "Description (English)",
        descriptionDe: "Description (German)",
        category: "Category",
        price: "Price per Day",
        image: "Main Image URL",
        images: "Gallery Images",
        status: "Status",
        gearbox: "Gearbox",
        seats: "Seats",
        fuelType: "Fuel Type",
        acceleration: "Acceleration (0-60 mph)",
        year: "Year",
      }

      const formattedErrors = error.errors.map((err) => {
        const fieldName = fieldNames[err.path[0] as string] || err.path[0]
        let message = err.message

        // Improve common error messages using switch to avoid type narrowing issues
        switch (err.code) {
          case "too_small":
            if (err.type === "string") {
              if (err.path[0] === "description" || err.path[0] === "descriptionDe") {
                message = `must be at least ${err.minimum} characters long`
              } else {
                message = `is required`
              }
            } else if (err.type === "number") {
              if (err.path[0] === "price") {
                message = `must be greater than 0`
              } else if (err.path[0] === "seats") {
                message = `must be between 2 and 9`
              } else if (err.path[0] === "year") {
                message = `must be between 1900 and 2030`
              } else {
                message = `must be at least ${err.minimum}`
              }
            }
            break
          case "too_big":
            if (err.type === "number") {
              if (err.path[0] === "seats") {
                message = `must be between 2 and 9`
              } else if (err.path[0] === "year") {
                message = `must be between 1900 and 2030`
              } else {
                message = `must not exceed ${err.maximum}`
              }
            } else if (err.type === "string") {
              message = `must not exceed ${err.maximum} characters`
            }
            break
          case "invalid_type":
            message = `has an invalid value`
            break
          case "invalid_string":
            if (err.validation === "url") {
              message = `must be a valid URL starting with http:// or https://`
            }
            break
          case "invalid_enum_value":
            message = `has an invalid value. Please select from the available options.`
            break
        }

        return `${fieldName}: ${message}`
      })

      return {
        error: "Validation failed",
        validationErrors: formattedErrors,
      }
    }

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to update car. Please try again." }
  }
}

export async function deleteCar(carId: string) {
  try {
    const admin = await requireAdmin()

    const existingCar = await prisma.car.findUnique({
      where: { id: carId },
    })

    if (!existingCar) {
      return { error: "Car not found" }
    }

    // Soft delete
    await prisma.car.update({
      where: { id: carId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    })

    // Create audit log
    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "CAR_DELETED",
        targetType: "car",
        targetId: carId,
        oldValue: existingCar,
      },
    })

    revalidatePath("/")
    revalidatePath("/admin")

    return { success: true }
  } catch (error) {
    console.error("[DELETE_CAR_ERROR]", error)

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to delete car" }
  }
}

export async function getCarAvailability(carId: string) {
  try {
    const car = await prisma.car.findUnique({
      where: { id: carId },
    })

    if (!car || car.isDeleted) {
      return { error: "Car not found" }
    }

    const now = new Date()
    const capacityHorizon = new Date(now)
    capacityHorizon.setFullYear(capacityHorizon.getFullYear() + 2)
    const [unavailableDates, handoverEvents] = await Promise.all([
      getUnavailableDates(carId),
      getHandoverEvents(prisma, now, capacityHorizon),
    ])

    return { unavailableDates, handoverEvents }
  } catch (error) {
    console.error("[GET_CAR_AVAILABILITY_ERROR]", error)
    return { error: "Failed to fetch availability" }
  }
}

export async function filterCarsByAvailability(carIds: string[], pickupDate: string, dropoffDate: string) {
  try {
    // Validate input parameters
    if (!Array.isArray(carIds) || carIds.length === 0) {
      return {
        availableCarIds: [],
      }
    }

    if (!pickupDate || !dropoffDate) {
      return {
        error: "Pickup and dropoff dates are required",
      }
    }

    // Validate and parse dates
    // Normalize dates to midnight local time to avoid timezone issues
    const pickup = new Date(pickupDate + "T00:00:00")
    const dropoff = new Date(dropoffDate + "T00:00:00")

    if (isNaN(pickup.getTime()) || isNaN(dropoff.getTime())) {
      return {
        error: "Invalid date format provided",
      }
    }

    if (pickup >= dropoff) {
      return {
        error: "Pickup date must be before dropoff date",
      }
    }

    // Cancel expired bookings first
    try {
    } catch (cancelError) {
      console.error("[CANCEL_EXPIRED_BOOKINGS_ERROR]", cancelError)
      // Continue with filtering even if cancellation fails
    }

    // Check availability for each car
    const availabilityChecks = await Promise.all(
      carIds.map(async (carId) => {
        try {
          const available = await isCarAvailable(carId, pickup, dropoff)
          return { carId, available }
        } catch (carError) {
          console.error(`[CAR_AVAILABILITY_CHECK_ERROR] Car ID: ${carId}`, carError)
          // If we can't check availability for a specific car, assume it's unavailable
          return { carId, available: false }
        }
      })
    )

    return {
      availableCarIds: availabilityChecks.filter(({ available }) => available).map(({ carId }) => carId),
    }
  } catch (error) {
    console.error("[FILTER_CARS_BY_AVAILABILITY_ERROR]", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
    return {
      error: `Failed to filter cars by availability: ${errorMessage}`,
    }
  }
}
