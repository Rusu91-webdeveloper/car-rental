import { prisma } from "@/lib/db"
import type { ReviewQueueItem } from "./repository"

export interface PresentedReviewQueueItem {
  documentId: string
  bookingId?: string
  documentTypeId: string
  documentTypeKey: string
  documentTypeName: string
  side: "SINGLE" | "FRONT" | "BACK"
  slotNumber: number
  attemptNumber: number
  status: string
  uploadedAt: Date
  pendingAgeMs: number
  application?: {
    id: string
    status: string
    customerName: string
    customerEmail: string
    carName: string
    carNameDe: string | null
    carImage: string
    pickupAt: Date
    returnAt: Date
    businessTimeZone: string
    location: string
    grandTotal: number | null
    currency: string
    totalDocuments: number
    approvedDocuments: number
    pendingDocuments: number
    actionRequiredDocuments: number
  }
}

export async function presentReviewQueue(items: ReviewQueueItem[]): Promise<PresentedReviewQueueItem[]> {
  if (items.length === 0) return []

  const documents = await prisma.customerDocument.findMany({
    where: { id: { in: items.map((item) => item.documentId) } },
    select: {
      id: true,
      documentType: { select: { key: true, name: true } },
      uploadSession: {
        select: {
          bookingApplication: {
            select: {
              id: true,
              status: true,
              pickupAt: true,
              returnAt: true,
              businessTimeZone: true,
              pickupLocation: true,
              customer: { select: { name: true, email: true } },
              car: { select: { name: true, nameDe: true, image: true } },
              pricingQuotes: {
                where: { isCurrent: true },
                select: { grandTotal: true, currency: true },
                take: 1,
              },
            },
          },
          customerDocuments: {
            where: { isCurrent: true, deletionStatus: { not: "DELETED" } },
            select: { manualReviewStatus: true },
          },
        },
      },
    },
  })
  const byId = new Map(documents.map((document) => [document.id, document]))

  return items.map((item) => {
    const record = byId.get(item.documentId)
    const application = record?.uploadSession?.bookingApplication
    const allDocuments = record?.uploadSession?.customerDocuments ?? []
    const quote = application?.pricingQuotes[0]

    return {
      ...item,
      documentTypeKey: record?.documentType.key ?? item.documentTypeId,
      documentTypeName: record?.documentType.name ?? item.documentTypeId,
      application: application
        ? {
            id: application.id,
            status: application.status,
            customerName: application.customer.name || application.customer.email,
            customerEmail: application.customer.email,
            carName: application.car.name,
            carNameDe: application.car.nameDe,
            carImage: application.car.image,
            pickupAt: application.pickupAt,
            returnAt: application.returnAt,
            businessTimeZone: application.businessTimeZone,
            location: application.pickupLocation,
            grandTotal: quote?.grandTotal ?? null,
            currency: quote?.currency ?? "EUR",
            totalDocuments: allDocuments.length,
            approvedDocuments: allDocuments.filter((document) => document.manualReviewStatus === "APPROVED").length,
            pendingDocuments: allDocuments.filter((document) => document.manualReviewStatus === "PENDING_REVIEW").length,
            actionRequiredDocuments: allDocuments.filter((document) =>
              ["REJECTED", "REPLACEMENT_REQUIRED"].includes(document.manualReviewStatus),
            ).length,
          }
        : undefined,
    }
  })
}
