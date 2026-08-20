import prisma from '../lib/prisma.js';

export const findById = (id, client = prisma) => {
  return client.specialty.findUnique({ where: { id } });
};