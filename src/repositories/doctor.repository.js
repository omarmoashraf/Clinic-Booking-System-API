import prisma from '../lib/prisma.js';

// Distinguishes a specialty id from a specialty name for the directory filter.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const buildSpecialtyWhere = (specialty) =>
  UUID_PATTERN.test(specialty)
    ? { id: specialty }
    : { name: { equals: specialty, mode: 'insensitive' } };

// Relations every doctor response needs, and nothing more:
// the owner's display name plus the specialty id/name.
const publicInclude = {
  user: { select: { full_name: true } },
  specialty: { select: { id: true, name: true } },
};

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

/**
 * Paginated doctor directory with an optional specialty filter
 * (accepts a specialty name or id). Defaults and the limit cap are
 * enforced by the route validator per docs/API.md.
 */
export const findMany = async (
  { page = 1, limit = 10, specialty },
  client = prisma
) => {
  const skip = (page - 1) * limit;

  const where = specialty ? { specialty: buildSpecialtyWhere(specialty) } : {};

  const [doctors, total] = await Promise.all([
    client.doctor.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ user: { full_name: 'asc' } }, { id: 'asc' }],
      include: publicInclude,
    }),
    client.doctor.count({ where }),
  ]);

  return {
    doctors,
    total,
  };
};

/**
 * Doctor detail with its specialty and the owner's display name.
 * Used by the public detail endpoint.
 */
export const findById = (id, client = prisma) => {
  return client.doctor.findUnique({
    where: { id },
    include: publicInclude,
  });
};

/**
 * Resolve the Doctor profile that belongs to a User account.
 * Used by self-service endpoints to enforce ownership
 * (req.user.id → their own Doctor row, never a client-supplied id).
 */
export const findByUserId = (userId, client = prisma) => {
  return client.doctor.findUnique({ where: { user_id: userId } });
};

export const update = (id, data, client = prisma) => {
  return client.doctor.update({
    where: { id },
    data,
    include: publicInclude,
  });
};