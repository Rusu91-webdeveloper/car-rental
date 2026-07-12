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
    locale: z.enum(["de", "en"]).default("de"),
    insuranceSelected: z.boolean().optional().default(false),
    legalAcknowledgements: z.object({
      rentalTerms: z.boolean().optional(),
      privacyNotice: z.boolean().optional(),
    }).optional(),
    customer: z.object({
      firstName: z.string().max(100).optional(), lastName: z.string().max(100).optional(), email: z.string().max(254).optional(), phone: z.string().max(40).optional(),
      dateOfBirth: z.string().max(10).optional(), country: z.string().max(2).optional(), address: z.string().max(200).optional(), city: z.string().max(100).optional(), postalCode: z.string().max(20).optional(), nationality: z.string().max(2).optional(),
      licenceNumber: z.string().max(100).optional(), licenceIssueDate: z.string().max(10).optional(), licenceExpiryDate: z.string().max(10).optional(), licenceIssuingCountry: z.string().max(2).optional(),
    }).optional(),
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

export const createBookingReviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(5).max(1000),
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
