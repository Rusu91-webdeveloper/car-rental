"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { createCarSchema, updateCarSchema } from "@/lib/validations"
import { getUnavailableDates, isCarAvailable } from "@/lib/availability"
import { runBookingLifecycleMaintenance } from "@/lib/booking-expiration"
import { z } from "zod"

export async function createCar(data: unknown) {
  try {
    const admin = await requireAdmin()

    // Validate input
    const validated = createCarSchema.parse(data)

    // Generate slug from name
    const slug = validated.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")

    const car = await prisma.car.create({
      data: {
        slug,
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

    // Create audit log
    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "CAR_CREATED",
        targetType: "car",
        targetId: car.id,
        newValue: validated,
      },
    })

    revalidatePath("/")
    revalidatePath("/admin")

    return { success: true, car }
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

    if (error instanceof Error) {
      return { error: error.message }
    }

    return { error: "Failed to create car. Please try again." }
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

    await runBookingLifecycleMaintenance()
    const unavailableDates = await getUnavailableDates(carId)

    return { unavailableDates }
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
      await runBookingLifecycleMaintenance()
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
