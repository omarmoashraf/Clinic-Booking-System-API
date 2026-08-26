-- Milestone 13 — replace the plain unique constraint on
-- "Appointment"."availability_id" with a partial unique index.
--
-- The old constraint allowed only ONE appointment per slot ever, which made
-- cancellation-with-history impossible. The partial index enforces the real
-- business rule: at most one NON-cancelled appointment per availability slot.
-- Cancelled appointments stay as history and a released slot can be booked
-- again. Prisma's schema language cannot express partial indexes, so this
-- index lives intentionally as raw SQL (same precedent as the Availability
-- end_time CHECK in 20260824235847_add_availability_end_time_check).
--
-- This is also the database-level backstop against concurrent double-booking:
-- two racing booking transactions can never both insert an active appointment
-- for the same slot.

DROP INDEX "Appointment_availability_id_key";

CREATE UNIQUE INDEX "Appointment_active_availability_key"
  ON "Appointment"("availability_id")
  WHERE status <> 'CANCELLED';
