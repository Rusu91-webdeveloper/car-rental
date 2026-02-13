import { z } from "zod"

const imageSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), "Invalid image URL")

// Booking validations
export const createBookingSchema = z
  .object({
    carId: z.string().min(1),
    pickupDate: z.string().datetime(),
    dropoffDate: z.string().datetime(),
    location: z.string().min(1),
    paymentMethod: z.enum(["TRANSFER", "PAY_AT_PICKUP"]).default("TRANSFER"),
  })
  .refine(
    (data) => {
      const pickup = new Date(data.pickupDate)
      const dropoff = new Date(data.dropoffDate)
      return dropoff > pickup
    },
    {
      message: "Drop-off date must be after pickup date",
      path: ["dropoffDate"],
    },
  )
  .refine(
    (data) => {
      const pickup = new Date(data.pickupDate)
      const now = new Date()
      return pickup >= now
    },
    {
      message: "Pickup date must be in the future",
      path: ["pickupDate"],
    },
  )

export const updateBookingStatusSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum(["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED"]),
  reason: z.string().optional(),
})

// Car validations
export const createCarSchema = z.object({
  name: z.string().min(1).max(100),
  nameDe: z.string().min(1).max(100),
  subtitle: z.string().max(200).optional(),
  subtitleDe: z.string().max(200).optional(),
  description: z.string().min(10),
  descriptionDe: z.string().min(10),
  category: z.enum(["ELECTRIC", "LUXURY", "SUV", "SEDAN", "EV"]),
  price: z.number().int().positive(),
  image: imageSchema,
  images: z.array(imageSchema).max(10).optional(),
  status: z.enum(["AVAILABLE", "LOW_STOCK", "RENTED", "MAINTENANCE"]).optional(),
  gearbox: z.string(),
  seats: z.number().int().min(2).max(9),
  fuelType: z.string(),
  acceleration: z.string(),
  year: z.number().int().min(1900).max(2030),
})

export const updateCarSchema = createCarSchema.partial()

// Auth validations
export const roleSchema = z.enum(["USER", "ADMIN"])

// Admin user management validations
export const createAdminUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: roleSchema.default("USER"),
})

export const setUserActiveStatusSchema = z.object({
  userId: z.string().min(1),
  isActive: z.boolean(),
})
