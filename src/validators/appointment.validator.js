import { z } from 'zod';

/**
 * Validators for Appointment endpoints
 *
 * Each validator defines the schema for:
 * - body: Request body validation
 * - params: URL parameters validation
 * - query: Query string validation
 *
 * These are used with the validate() middleware in routes.
 *
 * Structural validity only: the status enum here rejects garbage values,
 * while transition legality (e.g. PENDING → CONFIRMED is allowed but
 * COMPLETED → PENDING is not) is business logic owned by the service.
 */

// Helper: UUID validation
const uuidSchema = z.string().uuid('Invalid UUID format');

const appointmentStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'], {
  message: 'status must be one of PENDING, CONFIRMED, COMPLETED, CANCELLED',
});

// BOOK slot: POST /appointments
// The patient is derived from req.user; only the target slot and an optional
// note are client-supplied.
export const createAppointmentSchema = {
  body: z.object({
    availabilityId: uuidSchema,
    notes: z.string().trim().max(1000, 'notes must not exceed 1000 characters').optional(),
  }),
};

// LIST own appointments: GET /appointments/me
export const listAppointmentsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce.number().int().min(1).max(100).default(10),

    status: appointmentStatusSchema.optional(),
  }),
};

// READ one appointment: GET /appointments/:id
export const getAppointmentSchema = {
  params: z.object({
    id: uuidSchema,
  }),
};

// UPDATE status: PATCH /appointments/:id/status
// PENDING cannot be requested (appointments start as PENDING when booked).
export const updateAppointmentStatusSchema = {
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED'], {
      message: 'status must be one of CONFIRMED, CANCELLED, COMPLETED',
    }),
  }),
};
