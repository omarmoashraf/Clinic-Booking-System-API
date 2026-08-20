import prisma from '../lib/prisma.js';

export const create = (data, client = prisma) => {
  return client.patient.create({ data });
};