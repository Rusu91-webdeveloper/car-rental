-- The legacy upload model identified one file with (booking, type, side,
-- sequence). Phase 8 supports multiple stable slots and replacements, and
-- enforces uniqueness with CustomerDocument_phase8_current_slot_key instead.
-- Retain the old booking uniqueness rule only for legacy evidence rows.
DROP INDEX IF EXISTS "CustomerDocument_bookingId_documentTypeId_side_sequence_key";

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerDocument_legacy_booking_type_side_sequence_key"
  ON "CustomerDocument" ("bookingId", "documentTypeId", side, sequence)
  WHERE "evidenceSchemaVersion" = 1;
