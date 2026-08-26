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

/**
 * Atomically claim an AVAILABLE slot for booking: the UPDATE only matches
 * while the status is still AVAILABLE and takes a row lock, so of two
 * concurrent booking transactions exactly one updates the row — the other
 * blocks, re-evaluates the predicate against the committed row, and updates
 * zero rows. A zero count is the caller's signal to fail with 409.
 */
export const claimAvailableSlot = (id, client = prisma) => {
  return client.availability.updateMany({
    where: { id, status: 'AVAILABLE' },
    data: { status: 'BOOKED' },
  });
};

/**
 * Release a booked slot after cancellation. The guard refuses to release
 * when any OTHER non-cancelled appointment already references the slot, so
 * a release that races with a concurrent re-booking can never flip the slot
 * back to AVAILABLE under someone else's active appointment.
 */
export const releaseBookedSlot = ({ availabilityId, exceptAppointmentId }, client = prisma) => {
  return client.availability.updateMany({
    where: {
      id: availabilityId,
      status: 'BOOKED',
      appointments: {
        none: {
          id: { not: exceptAppointmentId },
          status: { not: 'CANCELLED' },
        },
      },
    },
    data: { status: 'AVAILABLE' },
  });
};
