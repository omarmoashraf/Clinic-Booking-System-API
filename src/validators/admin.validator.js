import { z } from 'zod';

const uuidSchema = z.string().uuid('Invalid UUID format');

export const listAdminUsersSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    role: z.enum(['PATIENT', 'DOCTOR', 'ADMIN']).optional(),
    isActive: z
      .string()
      .optional()
      .transform((val) => {
        if (val === 'true') return true;
        if (val === 'false') return false;
        return undefined;
      }),
  }),
};

export const updateAdminUserSchema = {
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    fullName: z.string().trim().min(1, 'fullName cannot be empty').max(150).optional(),
    phone: z.string().trim().max(30).optional(),
    isActive: z.boolean().optional(),
  }),
};

export const listAdminAppointmentsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
    doctorId: uuidSchema.optional(),
    patientId: uuidSchema.optional(),
  }),
};
