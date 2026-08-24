import { z } from 'zod';

/**
 * Validators for Doctor endpoints
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

// LIST Doctors with filters: GET /doctors
export const listDoctorsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce.number().int().min(1).max(100).default(10),

    specialty: z.string().trim().min(1).max(100).optional(),
  }),
});

// READ Doctor by ID: GET /doctors/:id
export const getDoctorSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

// UPDATE own Doctor profile: PATCH /doctors/me
export const updateDoctorSchema = z.object({
  body: z.object({
    bio: z
      .string()
      .trim()
      .min(1, 'bio must not be empty')
      .max(1000, 'bio must not exceed 1000 characters')
      .optional(),
    specialtyId: z.string().uuid('specialtyId must be a valid UUID').optional(),
  }),
});
