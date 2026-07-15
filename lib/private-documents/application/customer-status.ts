import { CUSTOMER_REVIEW_MESSAGES } from "./manual-review-service";
import type { DocumentRecord } from "./repository";

export type CustomerDocumentStatus =
  | "UPLOAD_RECEIVED"
  | "CHECKING_FILE"
  | "WAITING_FOR_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "REPLACEMENT_REQUIRED";

export function toCustomerDocumentStatus(document: DocumentRecord): {
  status: CustomerDocumentStatus;
  message: string;
} {
  if (document.manualReviewStatus === "APPROVED")
    return { status: "APPROVED", message: "Document approved." };
  if (document.manualReviewStatus === "REJECTED")
    return {
      status: "REJECTED",
      message: document.reviewReasonCode
        ? CUSTOMER_REVIEW_MESSAGES[document.reviewReasonCode]
        : "The document could not be approved.",
    };
  if (document.manualReviewStatus === "REPLACEMENT_REQUIRED")
    return {
      status: "REPLACEMENT_REQUIRED",
      message: document.reviewReasonCode
        ? CUSTOMER_REVIEW_MESSAGES[document.reviewReasonCode]
        : "Please upload a replacement document.",
    };
  if (document.manualReviewStatus === "PENDING_REVIEW")
    return {
      status: "WAITING_FOR_REVIEW",
      message: "Upload received and waiting for review.",
    };
  if (["VERIFYING", "UPLOADED"].includes(document.uploadStatus))
    return { status: "CHECKING_FILE", message: "Checking file." };
  return { status: "UPLOAD_RECEIVED", message: "Upload received." };
}
