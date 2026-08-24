import prisma from '../lib/prisma.js';

export const create = (data, client = prisma) => {
  return client.patient.create({ data });
};

/**
 * Resolve the Patient profile that belongs to a User account.
 * Used by self-service endpoints to enforce ownership
 * (req.user.id → their own Patient row, never a client-supplied id).
 */
export const findByUserId = (userId, client = prisma) => {
  return client.patient.findUnique({ where: { user_id: userId } });
};

export const findById = (id, client = prisma) => {
  return client.patient.findUnique({ where: { id } });
};

export const update = (id, data, client = prisma) => {
  return client.patient.update({ where: { id }, data });
};