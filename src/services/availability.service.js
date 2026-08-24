import * as availabilityRepo from '../repositories/availability.repository.js';
import * as doctorRepo from '../repositories/doctor.repository.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError.js';

/**
 * Public shape of a slot per docs/API.md: { id, date, startTime, endTime }.
 * The repository returns the DATE column as a Date at UTC midnight and the
 * TIME columns as Dates anchored at the epoch, so slicing their ISO strings
 * yields the exact clinic-local wall-clock values independent of the
 * server's timezone.
 */
const toDateOnly = (date) => date.toISOString().slice(0, 10);
const toTimeOnly = (time) => time.toISOString().slice(11, 16);

const toPublicSlot = (slot) => ({
  id: slot.id,
  date: toDateOnly(slot.date),
  startTime: toTimeOnly(slot.start_time),
  endTime: toTimeOnly(slot.end_time),
});

/**
 * Public listing of one doctor's bookable slots (AVAILABLE only).
 * Status filtering and the optional from/to date range are applied by the
 * database query, never by post-filtering rows in JavaScript.
 */
export const listAvailableSlots = async ({ doctorId, from, to }) => {
  const doctor = await doctorRepo.findById(doctorId);
  if (!doctor) {
    throw new NotFoundError('Doctor');
  }

  const slots = await availabilityRepo.findManyByDoctor({
    doctorId,
    status: 'AVAILABLE',
    from,
    to,
  });

  return slots.map(toPublicSlot);
};

/**
 * Create an availability slot owned by the authenticated doctor.
 *
 * The Doctor row is resolved from the authenticated user id (req.user.id),
 * never from client input, so a client cannot create slots for another
 * doctor.
 *
 * end > start is re-checked here as a business rule even though request
 * validation already enforces it (defense in depth at the service boundary).
 * Overlap is detected service-level against the database (same doctor + same
 * date; strict inequalities keep adjacent slots legal) per docs/API.md.
 */
export const createSlot = async (userId, { date, startTime, endTime }) => {
  const doctor = await doctorRepo.findByUserId(userId);
  if (!doctor) {
    throw new NotFoundError('Doctor');
  }

  if (endTime.getTime() <= startTime.getTime()) {
    throw new ValidationError('Invalid time range', [
      { field: 'endTime', message: 'endTime must be after startTime' },
    ]);
  }

  const overlapping = await availabilityRepo.findOverlapping({
    doctorId: doctor.id,
    date,
    startTime,
    endTime,
  });
  if (overlapping) {
    throw new ConflictError('Availability slot overlaps an existing slot');
  }

  const created = await availabilityRepo.createAvailability({
    doctor_id: doctor.id,
    date,
    start_time: startTime,
    end_time: endTime,
  });

  return toPublicSlot(created);
};

/**
 * Delete one of the authenticated doctor's own slots.
 *
 * Ownership flows strictly req.user → Doctor → Availability: another
 * doctor's slot is indistinguishable-by-id forbidden (403) and a booked slot
 * cannot be deleted (409). The slot id comes from the URL; nothing about
 * ownership is trusted from the client.
 */
export const deleteSlot = async (userId, id) => {
  const doctor = await doctorRepo.findByUserId(userId);
  if (!doctor) {
    throw new NotFoundError('Doctor');
  }

  const slot = await availabilityRepo.findById(id);
  if (!slot) {
    throw new NotFoundError('Availability');
  }

  if (slot.doctor_id !== doctor.id) {
    throw new ForbiddenError('You can only manage your own availability slots');
  }

  if (slot.status === 'BOOKED') {
    throw new ConflictError('A booked availability slot cannot be deleted');
  }

  await availabilityRepo.deleteAvailability(slot.id);
};
