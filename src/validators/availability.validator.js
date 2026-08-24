import { z } from 'zod';

/**
 * Validators for Availability endpoints
 *
 * Each validator defines the schema for:
 * - body: Request body validation
 * - params: URL parameters validation
 * - query: Query string validation
 *
 * These are used with the validate() middleware in routes.
 */

// Helper: UUID validation
const uuidSchema = z.string().uuid('Invalid UUID format');

// Slot dates are date-only values (Availability.date is a DATE column), so
// the API accepts exactly YYYY-MM-DD. Parsed to a Date at UTC midnight, which
// round-trips through the DATE column without timezone drift regardless of
// the server's local timezone (same convention as patient dateOfBirth).
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use the YYYY-MM-DD format')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'date must be a real calendar date')
  .transform((value) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  });

// Clinic wall-clock times (Availability.start_time/end_time are TIME columns),
// so the API accepts exactly HH:mm in 24-hour form. Parsed to a Date anchored
// at the Unix epoch so the UTC time-of-day matches the clinic-local wall-clock
// value; Prisma stores only that time-of-day in the TIME column.
const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must use the HH:mm (24-hour) format')
  .transform((value) => {
    const [hour, minute] = value.split(':').map(Number);
    return new Date(Date.UTC(1970, 0, 1, hour, minute));
  });

// CREATE slot: POST /doctors/me/availability
// The end > start rule is refined on the body schema itself — the validate
// middleware parses each request section individually, so a refinement on an
// outer wrapper would never run.
export const createAvailabilitySchema = {
  body: z
    .object({
      date: dateOnlySchema,
      startTime: timeOfDaySchema,
      endTime: timeOfDaySchema,
    })
    .refine(
      // Only compares parsed Date values: if either field failed its own
      // format rule above, Zod hands the raw string here instead.
      ({ startTime, endTime }) =>
        !(startTime instanceof Date) ||
        !(endTime instanceof Date) ||
        endTime.getTime() > startTime.getTime(),
      { path: ['endTime'], message: 'endTime must be after startTime' }
    ),
};

// LIST slots: GET /doctors/:doctorId/availability
// from/to are inclusive bounds on the slot date; validated when both appear.
export const listAvailabilitySchema = {
  params: z.object({
    doctorId: uuidSchema,
  }),
  query: z
    .object({
      from: dateOnlySchema.optional(),
      to: dateOnlySchema.optional(),
    })
    .refine(
      (query) =>
        query.from === undefined || query.to === undefined || query.from <= query.to,
      { path: ['to'], message: 'to must not be earlier than from' }
    ),
};

// DELETE slot: DELETE /doctors/me/availability/:id
export const deleteAvailabilitySchema = {
  params: z.object({
    id: uuidSchema,
  }),
};
