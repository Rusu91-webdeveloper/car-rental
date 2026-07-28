ALTER TABLE "GeneralRentalConfigVersion"
ADD COLUMN "weeklyOpeningHours" JSONB NOT NULL DEFAULT '{
  "MONDAY":{"isOpen":true,"pickupWindows":[{"opensAt":"00:00","closesAt":"23:59"}],"returnWindows":[{"opensAt":"00:00","closesAt":"23:59"}]},
  "TUESDAY":{"isOpen":true,"pickupWindows":[{"opensAt":"00:00","closesAt":"23:59"}],"returnWindows":[{"opensAt":"00:00","closesAt":"23:59"}]},
  "WEDNESDAY":{"isOpen":true,"pickupWindows":[{"opensAt":"00:00","closesAt":"23:59"}],"returnWindows":[{"opensAt":"00:00","closesAt":"23:59"}]},
  "THURSDAY":{"isOpen":true,"pickupWindows":[{"opensAt":"00:00","closesAt":"23:59"}],"returnWindows":[{"opensAt":"00:00","closesAt":"23:59"}]},
  "FRIDAY":{"isOpen":true,"pickupWindows":[{"opensAt":"00:00","closesAt":"23:59"}],"returnWindows":[{"opensAt":"00:00","closesAt":"23:59"}]},
  "SATURDAY":{"isOpen":true,"pickupWindows":[{"opensAt":"00:00","closesAt":"23:59"}],"returnWindows":[{"opensAt":"00:00","closesAt":"23:59"}]},
  "SUNDAY":{"isOpen":true,"pickupWindows":[{"opensAt":"00:00","closesAt":"23:59"}],"returnWindows":[{"opensAt":"00:00","closesAt":"23:59"}]}
}'::jsonb,
ADD COLUMN "openingHoursExceptions" JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN "handoverPolicy" JSONB NOT NULL DEFAULT '{
  "slotIntervalMinutes":30,
  "minimumLeadTimeMinutes":0,
  "maximumPickupsPerSlot":100,
  "maximumReturnsPerSlot":100,
  "maximumTotalHandoversPerSlot":100
}'::jsonb;
