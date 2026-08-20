import {z} from 'zod';

const emailSchema = z.string().trim().email('Must be valid email').max(255);

const registerPasswordSchema = z.string()
.min(8, 'Password must be at least 8 charachters')
.max(72 , 'Password must not exceed 72 charachters');

const refreshTokenSchema = z.string().min(1,'refreshToken is required');


export const registerSchema = z.object({
  body: z
    .object({
      email: emailSchema,
      password: registerPasswordSchema,
      fullName: z.string().trim().min(1, 'fullName is required').max(150),
      phone: z.string().trim().max(30, 'phone must not exceed 30 characters').optional(),
      role: z.enum(['PATIENT', 'DOCTOR']),
      specialtyId: z.string().uuid('specialtyId must be a valid UUID').optional(),
    })
    .superRefine((data, ctx) => {
      if (data.role === 'DOCTOR' && !data.specialtyId) {
        ctx.addIssue({
          code: 'custom',
          path: ['specialtyId'],
          message: 'specialtyId is required when role is DOCTOR',
        });
      }
    }),
});


export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1,'password is required')
  }),
});


export const refreshSchema = z.object({
  body: z.object({
    refreshToken: refreshTokenSchema,
  }),
});

export const logoutSchema = z.object({
  body: z.object({
    refreshToken: refreshTokenSchema
  }),
});