-- Availability time invariant, deferred from the foundation migration to the
-- availability milestone (see docs/DATABASE.md): a slot can never end before
-- or exactly when it starts. PostgreSQL CHECK constraints cannot be DEFERRABLE
-- (deferral applies only to FK/unique/exclusion constraints), so this is a
-- plain CHECK evaluated per row on every write — which is exactly what this
-- invariant needs.
ALTER TABLE "Availability"
  ADD CONSTRAINT "Availability_end_time_check" CHECK ("end_time" > "start_time");
