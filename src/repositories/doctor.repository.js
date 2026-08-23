import prisma from '../lib/prisma.js';

export const create = (data, client = prisma) => {
  return client.doctor.create({ data });
};

export const countBySpecialtyId = (specialtyId, client = prisma) => {
  return client.doctor.count({
    where: {
      specialty_id: specialtyId,
    },
  });
};