import { z } from 'zod';

/**
 * Validators for Specialty endpoints
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

// CREATE Specialty: POST /specialties
export const createSpecialtySchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Specialty name must be at least 2 characters')
      .max(100, 'Specialty name must not exceed 100 characters')
      .refine(
        (name) => !/[^a-zA-Z\s\-&]/.test(name),
        'Specialty name can only contain letters, spaces, hyphens, and ampersands'
      ),
  }),
});

// READ Specialty by ID: GET /specialties/:id
export const getSpecialtySchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

// UPDATE Specialty: PUT /specialties/:id
export const updateSpecialtySchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Specialty name must be at least 2 characters')
      .max(100, 'Specialty name must not exceed 100 characters'),
  }),
});

// DELETE Specialty: DELETE /specialties/:id
export const deleteSpecialtySchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

// LIST Specialties with filters: GET /specialties
export const listSpecialtiesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce.number().int().min(1).max(100).default(10),

    search: z.string().trim().optional(),
  }),
});