import { Prisma } from '../generated/prisma/client.ts';
import prisma from '../lib/prisma.js';
import * as appointmentRepo from '../repositories/appointment.repository.js';
import * as availabilityRepo from '../repositories/availability.repository.js';
import * as patientRepo from '../repositories/patient.repository.js';
import * as doctorRepo from '../repositories/doctor.repository.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors/AppError.js';
import { isSlotPast } from '../utils/clinic-time.js';

/**
 * Appointment lifecycle state machine (docs/API.md):
 *   PENDING   → CONFIRMED | CANCELLED
 *   CONFIRMED → COMPLETED | CANCELLED
 * COMPLETED and CANCELLED are terminal. Any other transition is a 409.
 */
const ALLOWED_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * Public shape of an appointment per docs/API.md. Slot wall-clock values use
 * the same serialization as the availability module (DATE columns come back
 * at UTC midnight and TIME columns anchored at the epoch, so slicing their
 * ISO strings yields the exact clinic-local values independent of the
 * server's timezone). No account/auth internals are ever included.
 */
const toDateOnly = (date) => date.toISOString().slice(0, 10);
const toTimeOnly = (time) => time.toISOString().slice(11, 16);

export const toPublicAppointment = (appointment) => ({
  id: appointment.id,
  status: appointment.status,
  notes: appointment.notes,
  createdAt: appointment.created_at,
  updatedAt: appointment.updated_at,
  patient: {
    id: appointment.patient.id,
    fullName: appointment.patient.user.full_name,
  },
  doctor: {
    id: appointment.doctor.id,
    fullName: appointment.doctor.user.full_name,
    specialty: appointment.doctor.specialty,
  },
  availability: {
    id: appointment.availability.id,
    date: toDateOnly(appointment.availability.date),
    startTime: toTimeOnly(appointment.availability.start_time),
    endTime: toTimeOnly(appointment.availability.end_time),
  },
});

/**
 * Book an available slot for the authenticated patient.
 *
 * Ownership is derived entirely from server-side state:
 *   req.user → Patient row → appointment.patient_id; the doctor comes from
 * the selected Availability row — never from client input.
 *
 * The claim and the insert run inside ONE transaction:
 *   1. conditionally UPDATE the slot AVAILABLE → BOOKED (row lock; loses to
 *      a concurrent booking by matching zero rows), then
 *   2. INSERT the PENDING appointment.
 *
 * The partial unique index on active appointments is the database-level
 * backstop: if two transactions ever raced past step 1, the second INSERT
 * would violate it. That expected violation is mapped to the same friendly
 * 409 instead of surfacing raw Prisma errors or a 500.
 */
export const book = async (userId, { availabilityId, notes }) => {
  const patient = await patientRepo.findByUserId(userId);
  if (!patient) {
    throw new NotFoundError('Patient');
  }

  const slot = await availabilityRepo.findById(availabilityId);
  if (!slot) {
    throw new NotFoundError('Availability');
  }

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      const claimed = await availabilityRepo.claimAvailableSlot(slot.id, tx);
      if (claimed.count === 0) {
        throw new ConflictError('Appointment slot is already booked');
      }

      return appointmentRepo.create(
        {
          availability_id: slot.id,
          doctor_id: slot.doctor_id,
          patient_id: patient.id,
          ...(notes !== undefined && { notes }),
        },
        tx
      );
    });

    return toPublicAppointment(appointment);
  } catch (error) {
    // Two bookings of the same slot raced all the way to the database and
    // the partial unique index rejected the loser — an expected conflict,
    // not a server error.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictError('Appointment slot is already booked');
    }
    throw error;
  }
};

/**
 * List the authenticated user's own appointments (as patient or as doctor).
 * The ownership filter is resolved from req.user's profile row and applied
 * by the database query, never by filtering rows in JavaScript.
 */
export const listMine = async (user, { page, limit, status }) => {
  const ownerFilter = await resolveOwnerFilter(user);

  const { appointments, total } = await appointmentRepo.findMany({
    ...ownerFilter,
    status,
    page,
    limit,
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

/**
 * Fetch one appointment with ownership enforcement.
 * ADMIN may view any appointment; PATIENT/DOCTOR only their own. A missing
 * appointment and a foreign appointment are distinguishable states here
 * (404 vs 403) but the response never leaks another user's data.
 */
export const getById = async (user, id) => {
  const appointment = await appointmentRepo.findById(id);
  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  if (user.role !== 'ADMIN') {
    const ownerFilter = await resolveOwnerFilter(user);
    const isOwner =
      (ownerFilter.patientId && ownerFilter.patientId === appointment.patient_id) ||
      (ownerFilter.doctorId && ownerFilter.doctorId === appointment.doctor_id);

    if (!isOwner) {
      throw new ForbiddenError('You can only view your own appointments');
    }
  }

  return toPublicAppointment(appointment);
};

/**
 * Controlled status transition on one of the actor's own appointments.
 *
 * Role rules (docs/API.md):
 *   - DOCTOR may apply any valid transition on their own appointments;
 *   - PATIENT may only CANCEL their own appointments (confirm/complete
 *     attempts are a permission violation → 403, not a state conflict).
 *
 * Past-appointment immutability (PRD): once the slot has fully elapsed in
 * clinic time (Africa/Cairo) the appointment can no longer be modified —
 * except that its own doctor may still mark a CONFIRMED appointment
 * COMPLETED.
 *
 * Cancellation additionally releases the slot inside the same transaction,
 * so the appointment and the slot can never disagree about the release.
 */
export const updateStatus = async (user, id, requestedStatus) => {
  const appointment = await appointmentRepo.findById(id);
  if (!appointment) {
    throw new NotFoundError('Appointment');
  }

  if (user.role === 'PATIENT') {
    if (requestedStatus !== 'CANCELLED') {
      throw new ForbiddenError('Patients can only cancel their own appointments');
    }
    const patient = await patientRepo.findByUserId(user.id);
    if (!patient) {
      throw new NotFoundError('Patient');
    }

    if (appointment.patient_id !== patient.id) {
      throw new ForbiddenError('You can only manage your own appointments');
    }
  } else {
    const doctor = await doctorRepo.findByUserId(user.id);
    if (!doctor) {
      throw new NotFoundError('Doctor');
    }

    if (appointment.doctor_id !== doctor.id) {
      throw new ForbiddenError('You can only manage your own appointments');
    }
  }

  const currentStatus = appointment.status;
  if (!ALLOWED_TRANSITIONS[currentStatus].includes(requestedStatus)) {
    throw new ConflictError(
      `Cannot change appointment status from ${currentStatus} to ${requestedStatus}`
    );
  }

  const past = isSlotPast(appointment.availability);
  const doctorCompletionException =
    user.role === 'DOCTOR' &&
    currentStatus === 'CONFIRMED' &&
    requestedStatus === 'COMPLETED';

  if (past && !doctorCompletionException) {
    throw new ConflictError(
      'Past appointments cannot be modified except by marking them completed'
    );
  }

  if (requestedStatus === 'CANCELLED') {
    await prisma.$transaction(async (tx) => {
      // Conditional update: a concurrent cancel/confirm/complete that won
      // the row lock first makes this match zero rows.
      const updated = await appointmentRepo.updateStatusIfCurrent(
        { id: appointment.id, fromStatuses: [currentStatus], toStatus: 'CANCELLED' },
        tx
      );
      if (updated.count === 0) {
        throw new ConflictError(
          `Cannot change appointment status from ${currentStatus} to ${requestedStatus}`
        );
      }

      // Guarded release: refuses if any OTHER active appointment already
      // references the slot, so this cannot undo a concurrent re-booking.
      const released = await availabilityRepo.releaseBookedSlot(
        { availabilityId: appointment.availability_id, exceptAppointmentId: appointment.id },
        tx
      );
      if (released.count === 0) {
        throw new ConflictError('Failed to release the appointment slot');
      }
    });
  } else {
    const updated = await appointmentRepo.updateStatusIfCurrent({
      id: appointment.id,
      fromStatuses: [currentStatus],
      toStatus: requestedStatus,
    });
    if (updated.count === 0) {
      throw new ConflictError(
        `Cannot change appointment status from ${currentStatus} to ${requestedStatus}`
      );
    }
  }

  const refreshed = await appointmentRepo.findById(appointment.id);
  return toPublicAppointment(refreshed);
};

/**
 * Resolve req.user's role profile into a database-level ownership filter:
 *   PATIENT → { patientId }, DOCTOR → { doctorId }. ADMIN never reaches
 * this helper (handled per-endpoint). A missing profile row is the same
 * integrity error the patients/doctors modules surface (404).
 */
async function resolveOwnerFilter(user) {
  if (user.role === 'PATIENT') {
    const patient = await patientRepo.findByUserId(user.id);
    if (!patient) {
      throw new NotFoundError('Patient');
    }
    return { patientId: patient.id };
  }

  const doctor = await doctorRepo.findByUserId(user.id);
  if (!doctor) {
    throw new NotFoundError('Doctor');
  }
  return { doctorId: doctor.id };
}
