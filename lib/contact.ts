import { z } from "zod"

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(5_000),
  website: z.string().max(200).optional().default(""),
  locale: z.enum(["de", "en"]).default("de"),
})

export type ContactMessageInput = z.input<typeof contactMessageSchema>
