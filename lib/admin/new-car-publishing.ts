export type NewCarPublishingMode = "AUTO_PUBLISH" | "PENDING_REVIEW" | "SETUP_DRAFT"

export function newCarPublishingMode(input: {
  hasActiveRelease: boolean
  hasPendingRelease: boolean
}): NewCarPublishingMode {
  if (!input.hasActiveRelease) return "SETUP_DRAFT"
  return input.hasPendingRelease ? "PENDING_REVIEW" : "AUTO_PUBLISH"
}
