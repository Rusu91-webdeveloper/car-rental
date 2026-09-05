UPDATE "BookingApplication"
SET "expiresAt" = "pickupAt"
WHERE status IN (
  'DRAFT',
  'AWAITING_DOCUMENT_UPLOAD',
  'AWAITING_DOCUMENT_REVIEW',
  'CUSTOMER_ACTION_REQUIRED',
  'READY_TO_FINALIZE'
)
AND "expiresAt" > "pickupAt";
