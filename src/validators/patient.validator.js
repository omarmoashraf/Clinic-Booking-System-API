import { z } from 'zod';

/**
 * Validators for Patient endpoints
 *
 * Each validator defines the schema for:
 * - body: Request body validation
 * - params: URL parameters validation
 * - query: Query string validation
 *
 * These are used with the validate() middleware in routes.
 */

// Date-of-birth is a date-only value (Patient.date_of_birth is a DATE column),
// so the API accepts exactly YYYY-MM-DD. It is parsed to a Date at UTC midnight,
// which round-trips through the DATE column without timezone drift regardless
// of the server's local timezone.
const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must use the YYYY-MM-DD format')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'dateOfBirth must be a real calendar date')
  .transform((value) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  });

// UPDATE own patient profile: PATCH /patients/me
// Partial update: every field is optional and unknown fields are stripped.
export const updatePatientSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .trim()
      .min(1, 'fullName must not be empty')
      .max(150, 'fullName must not exceed 150 characters')
      .optional(),
    phone: z
      .string()
      .trim()
      .max(30, 'phone must not exceed 30 characters')
      .optional(),
    dateOfBirth: dateOfBirthSchema.optional(),
  }),
});
