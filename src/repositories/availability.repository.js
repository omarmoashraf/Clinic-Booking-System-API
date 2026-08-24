import prisma from '../lib/prisma.js';

export const findById = (id, client = prisma) => {
  return client.availability.findUnique({ where: { id } });
};

/**
 * A doctor's slots, optionally narrowed to one status and an inclusive
 * date range (from <= date <= to). Filtering and ordering happen entirely
 * in the database; the (doctor_id, date) index backs this query.
 */
export const findManyByDoctor = (
  { doctorId, status, from, to },
  client = prisma
) => {
  return client.availability.findMany({
    where: {
      doctor_id: doctorId,
      ...(status && { status }),
      ...((from || to) && {
        date: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      }),
    },
    orderBy: [{ date: 'asc' }, { start_time: 'asc' }, { id: 'asc' }],
  });
};

/**
 * Overlap probe for the same doctor and date:
 * existing.start_time < newEnd AND existing.end_time > newStart.
 * Strict inequalities keep adjacent slots (newStart == existingEnd or
 * newEnd == existingStart) out of the result.
 */
export const findOverlapping = (
  { doctorId, date, startTime, endTime },
  client = prisma
) => {
  return client.availability.findFirst({
    where: {
      doctor_id: doctorId,
      date,
      start_time: { lt: endTime },
      end_time: { gt: startTime },
    },
  });
};

export const createAvailability = (data, client = prisma) => {
  return client.availability.create({ data });
};

export const deleteAvailability = (id, client = prisma) => {
  return client.availability.delete({ where: { id } });
};
