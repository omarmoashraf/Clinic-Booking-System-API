import prisma from '../lib/prisma.js';

// Relations every appointment response needs, and nothing more:
// the patient's and doctor's display names, the doctor's specialty, and the
// booked slot's wall-clock values. Auth state (password hashes, lockout
// counters) never leaves the repository for these queries.
const publicInclude = {
  patient: { select: { id: true, user: { select: { full_name: true } } } },
  doctor: {
    select: {
      id: true,
      user: { select: { full_name: true } },
      specialty: { select: { id: true, name: true } },
    },
  },
  availability: { select: { id: true, date: true, start_time: true, end_time: true } },
};

/**
 * One appointment with its response relations.
 * Used by GET /appointments/:id and the status-update flow.
 */
export const findById = (id, client = prisma) => {
  return client.appointment.findUnique({
    where: { id },
    include: publicInclude,
  });
};

/**
 * Paginated appointment list for one owner with an optional status filter.
 *
 * The ownership filter is part of the database query — exactly one of
 * patientId/doctorId is supplied by the service after resolving the
 * authenticated user's profile row. Filtering, pagination and counting all
 * happen in SQL; rows are never post-filtered in JavaScript. Ordered by the
 * slot's date then start time so the list reads chronologically.
 */
export const findMany = async (
  { patientId, doctorId, status, page = 1, limit = 10 },
  client = prisma
) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(patientId && { patient_id: patientId }),
    ...(doctorId && { doctor_id: doctorId }),
    ...(status && { status }),
  };

  const [appointments, total] = await Promise.all([
    client.appointment.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { availability: { date: 'asc' } },
        { availability: { start_time: 'asc' } },
        { id: 'asc' },
      ],
      include: publicInclude,
    }),
    client.appointment.count({ where }),
  ]);

  return {
    appointments,
    total,
  };
};

/**
 * Create an appointment inside a booking transaction.
 * The slot has already been claimed (AVAILABLE → BOOKED) by the caller.
 */
export const create = (data, client = prisma) => {
  return client.appointment.create({
    data,
    include: publicInclude,
  });
};

/**
 * Conditional status transition: only moves the appointment when its current
 * status still matches. Returns the update count — a count of 0 means a
 * concurrent request changed the status first and the caller must treat the
 * transition as invalid. The row lock taken by the UPDATE also serializes
 * concurrent transitions on the same appointment.
 */
export const updateStatusIfCurrent = ({ id, fromStatuses, toStatus }, client = prisma) => {
  return client.appointment.updateMany({
    where: { id, status: { in: fromStatuses } },
    data: { status: toStatus },
  });
};
