import prisma from '../lib/prisma.js';
import * as userRepo from '../repositories/user.repository.js';
import * as refreshTokenRepo from '../repositories/refresh-token.repository.js';
import * as appointmentRepo from '../repositories/appointment.repository.js';
import { toPublicAppointment } from './appointments.service.js';
import { NotFoundError } from '../errors/AppError.js';

const mapUser = (user) => ({
  id: user.id,
  email: user.email,
  fullName: user.full_name,
  phone: user.phone,
  role: user.role,
  isActive: user.is_active,
  createdAt: user.created_at,
  updatedAt: user.updated_at,
});

/**
 * Paginated list of users with optional role and isActive filters.
 */
export const listUsers = async ({ page = 1, limit = 10, role, isActive }) => {
  const [users, total] = await Promise.all([
    userRepo.findUsers({ page, limit, role, isActive }),
    userRepo.countUsers({ role, isActive }),
  ]);

  return {
    users: users.map(mapUser),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Update user account details (fullName, phone, isActive).
 * If isActive is set to false, all active refresh tokens for the user are revoked.
 */
export const updateUser = async (id, { fullName, phone, isActive }) => {
  const existingUser = await userRepo.findUserById(id);
  if (!existingUser) {
    throw new NotFoundError('User');
  }

  const updateData = {};
  if (fullName !== undefined) updateData.full_name = fullName;
  if (phone !== undefined) updateData.phone = phone;
  if (isActive !== undefined) updateData.is_active = isActive;

  if (Object.keys(updateData).length === 0) {
    return mapUser(existingUser);
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const updated = await userRepo.updateUser(id, updateData, tx);
    if (isActive === false) {
      await refreshTokenRepo.revokeAllForUser(id, tx);
    }
    return updated;
  });

  return mapUser(updatedUser);
};

/**
 * Read-only administrative oversight of all appointments.
 */
export const listAppointments = async ({ page = 1, limit = 10, status, doctorId, patientId }) => {
  const { appointments, total } = await appointmentRepo.findMany({
    page,
    limit,
    status,
    doctorId,
    patientId,
  });

  return {
    appointments: appointments.map(toPublicAppointment),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};
