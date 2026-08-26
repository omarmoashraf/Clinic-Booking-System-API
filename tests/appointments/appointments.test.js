/**
 * Milestone 13 — Appointments & Booking integration tests.
 *
 * Follows the M8–M12 conventions: real app + real PostgreSQL via
 * setupTestDatabase/teardownDatabase helpers, supertest requests against
 * the Express app, direct Prisma assertions for persistence, serial file
 * execution.
 *
 * Booking fixtures use the real POST /appointments flow wherever that IS
 * the subject under test; state-machine and past-appointment scenarios seed
 * slot+appointment pairs directly (same precedent as M12's seedSlot and the
 * auth suite's insertRefreshToken) because reaching states like COMPLETED
 * through the API adds no coverage of this milestone's rules.
 */
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import app from '../../src/app.js';
import { setupTestDatabase, teardownTestDatabase, prisma } from '../helpers/db.js';
import {
  createSpecialty,
  createAdmin,
  createAuthenticatedUser,
} from '../helpers/auth.js';

const BASE = '/api/v1/appointments';

const bookRequest = (body, token) =>
  request(app).post(BASE).send(body).auth(token ?? '', { type: 'bearer' });
const listMineRequest = (query, token) =>
  request(app).get(`${BASE}/me`).query(query ?? {}).auth(token ?? '', { type: 'bearer' });
const getAppointmentRequest = (id, token) =>
  request(app).get(`${BASE}/${id}`).auth(token ?? '', { type: 'bearer' });
const statusRequest = (id, status, token) =>
  request(app)
    .patch(`${BASE}/${id}/status`)
    .send({ status })
    .auth(token ?? '', { type: 'bearer' });

const createDoctorAccount = (specialtyId, fullName) =>
  createAuthenticatedUser({ role: 'DOCTOR', specialtyId, fullName });
const createPatientAccount = (fullName) =>
  createAuthenticatedUser({ role: 'PATIENT', fullName });

const doctorRowFor = (userId) => prisma.doctor.findUnique({ where: { user_id: userId } });
const patientRowFor = (userId) => prisma.patient.findUnique({ where: { user_id: userId } });

/** Seed one slot directly (fixture where going through the API adds no value). */
const seedSlot = (doctorId, date, startTime, endTime, status = 'AVAILABLE') =>
  prisma.availability.create({
    data: {
      doctor_id: doctorId,
      date: new Date(`${date}T00:00:00.000Z`),
      start_time: new Date(`1970-01-01T${startTime}:00.000Z`),
      end_time: new Date(`1970-01-01T${endTime}:00.000Z`),
      ...(status !== 'AVAILABLE' && { status }),
    },
  });

/**
 * Seed a booked slot together with its appointment in one fixture step.
 * The slot is created BOOKED so the seeded pair matches the invariant the
 * booking flow would have produced (slot BOOKED + non-cancelled appointment).
 */
const seedBookedAppointment = async ({
  doctorId,
  patientId,
  date,
  startTime,
  endTime,
  status = 'PENDING',
  notes,
}) => {
  const slot = await seedSlot(doctorId, date, startTime, endTime, 'BOOKED');
  const appointment = await prisma.appointment.create({
    data: {
      availability_id: slot.id,
      doctor_id: doctorId,
      patient_id: patientId,
      status,
      ...(notes !== undefined && { notes }),
    },
    include: {
      patient: { select: { id: true, user: { select: { full_name: true } } } },
      doctor: {
        select: {
          id: true,
          user: { select: { full_name: true } },
          specialty: { select: { id: true, name: true } },
        },
      },
      availability: { select: { id: true, date: true, start_time: true, end_time: true } },
    },
  });
  return { slot, appointment };
};

/**
 * Clinic-local "today" (YYYY-MM-DD in Africa/Cairo). Past/future fixtures
 * are derived as ±3 days so no test depends on the machine timezone or on
 * DST boundary timing.
 */
const cairoToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const TODAY_IN_CAIRO = cairoToday();
const FUTURE_DATE = addDays(TODAY_IN_CAIRO, 3);
const PAST_DATE = addDays(TODAY_IN_CAIRO, -3);

let admin;
let spec;

before(async () => {
  await setupTestDatabase();
  admin = await createAdmin();
  spec = await createSpecialty(`Appointments Fixture ${randomUUID()}`);
});

after(teardownTestDatabase);

describe('POST /api/v1/appointments', () => {
  it('lets a PATIENT book an AVAILABLE slot and persists the full triple', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Booked');
    const patient = await createPatientAccount('Pat Booked');
    const doctorId = (await doctorRowFor(doctor.userId)).id;
    const patientId = (await patientRowFor(patient.userId)).id;
    const slot = await seedSlot(doctorId, FUTURE_DATE, '09:00', '10:00');

    const response = await bookRequest(
      { availabilityId: slot.id, notes: 'First visit' },
      patient.accessToken
    );

    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'success');

    const data = response.body.data;
    assert.deepEqual(Object.keys(data).sort(), [
      'availability',
      'createdAt',
      'doctor',
      'id',
      'notes',
      'patient',
      'status',
      'updatedAt',
    ]);
    assert.equal(data.status, 'PENDING', 'new bookings start as PENDING');
    assert.equal(data.notes, 'First visit');
    assert.deepEqual(data.patient, { id: patientId, fullName: 'Pat Booked' });
    assert.equal(data.doctor.id, doctorId);
    assert.equal(data.doctor.fullName, 'Dr. Booked');
    assert.deepEqual(data.doctor.specialty, { id: spec.id, name: spec.name });
    assert.deepEqual(data.availability, {
      id: slot.id,
      date: FUTURE_DATE,
      startTime: '09:00',
      endTime: '10:00',
    });

    // Persistence: correct owner triple + flipped slot status.
    const row = await prisma.appointment.findUnique({ where: { id: data.id } });
    assert.ok(row, 'appointment must persist');
    assert.equal(row.patient_id, patientId, 'appointment belongs to the authenticated patient');
    assert.equal(row.doctor_id, doctorId, 'doctor comes from the availability row');
    assert.equal(row.availability_id, slot.id);
    assert.equal(row.status, 'PENDING');

    const slotRow = await prisma.availability.findUnique({ where: { id: slot.id } });
    assert.equal(slotRow.status, 'BOOKED', 'booking must flip the slot to BOOKED');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const response = await bookRequest({ availabilityId: randomUUID() });
    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'unauthorized');
  });

  it('rejects DOCTOR and ADMIN roles with 403', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Cannot Book');
    const doctorAttempt = await bookRequest(
      { availabilityId: randomUUID() },
      doctor.accessToken
    );
    assert.equal(doctorAttempt.status, 403);
    assert.equal(doctorAttempt.body.status, 'forbidden');

    const adminAttempt = await bookRequest({ availabilityId: randomUUID() }, admin.accessToken);
    assert.equal(adminAttempt.status, 403);
    assert.equal(adminAttempt.body.status, 'forbidden');
  });

  it('returns 404 for a missing availability slot', async () => {
    const patient = await createPatientAccount('Pat Missing Slot');
    const response = await bookRequest({ availabilityId: randomUUID() }, patient.accessToken);
    assert.equal(response.status, 404);
    assert.equal(response.body.message, 'Availability not found');
  });

  it('rejects malformed bodies with 400', async () => {
    const patient = await createPatientAccount('Pat Validation');
    for (const badBody of [
      {},
      { availabilityId: 'not-a-uuid' },
      { availabilityId: 12345 },
      { availabilityId: randomUUID(), notes: 42 },
      { availabilityId: randomUUID(), notes: 'x'.repeat(1001) },
    ]) {
      const response = await bookRequest(badBody, patient.accessToken);
      assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(badBody)}`);
      assert.equal(response.body.status, 'validation_error');
      assert.ok(Array.isArray(response.body.errors));
    }
  });

  it('ignores client-supplied ownership/status fields instead of trusting them', async () => {
    const drA = await createDoctorAccount(spec.id, 'Dr. Forge Target');
    const drB = await createDoctorAccount(spec.id, 'Dr. Real Owner');
    const patA = await createPatientAccount('Pat Forger');
    const patB = await createPatientAccount('Pat Victim');
    const slot = await seedSlot((await doctorRowFor(drB.userId)).id, FUTURE_DATE, '10:00', '11:00');

    const response = await bookRequest(
      {
        availabilityId: slot.id,
        patientId: (await patientRowFor(patB.userId)).id,
        doctorId: (await doctorRowFor(drA.userId)).id,
        status: 'COMPLETED',
      },
      patA.accessToken
    );

    assert.equal(response.status, 201);
    const row = await prisma.appointment.findUnique({ where: { id: response.body.data.id } });
    assert.equal(row.patient_id, (await patientRowFor(patA.userId)).id, 'owner must be the caller');
    assert.equal(row.doctor_id, (await doctorRowFor(drB.userId)).id, 'doctor must own the slot');
    assert.equal(row.status, 'PENDING', 'client cannot set the initial status');
  });

  it('returns 409 when the slot is already booked', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Taken');
    const patA = await createPatientAccount('Pat Winner');
    const patB = await createPatientAccount('Pat Loser');
    const doctorId = (await doctorRowFor(doctor.userId)).id;
    const slot = await seedSlot(doctorId, FUTURE_DATE, '11:00', '12:00');

    const first = await bookRequest({ availabilityId: slot.id }, patA.accessToken);
    assert.equal(first.status, 201);

    const second = await bookRequest({ availabilityId: slot.id }, patB.accessToken);
    assert.equal(second.status, 409);
    assert.equal(second.body.status, 'conflict');
    assert.equal(second.body.message, 'Appointment slot is already booked');

    const rows = await prisma.appointment.findMany({ where: { availability_id: slot.id } });
    assert.equal(rows.length, 1, 'only one appointment may exist for the slot');
  });
});

describe('concurrent booking of the same slot', () => {
  it('lets exactly one of two simultaneous requests succeed', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Race');
    const patA = await createPatientAccount('Pat Race A');
    const patB = await createPatientAccount('Pat Race B');
    const doctorId = (await doctorRowFor(doctor.userId)).id;
    const slot = await seedSlot(doctorId, FUTURE_DATE, '13:00', '14:00');

    const [responseA, responseB] = await Promise.all([
      bookRequest({ availabilityId: slot.id }, patA.accessToken),
      bookRequest({ availabilityId: slot.id }, patB.accessToken),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    assert.deepEqual(statuses, [201, 409], 'exactly one booking succeeds, one gets 409');

    const winner = responseA.status === 201 ? responseA : responseB;
    const loser = responseA.status === 201 ? responseB : responseA;
    assert.equal(loser.body.status, 'conflict');
    assert.equal(loser.body.message, 'Appointment slot is already booked');

    // Database invariants after the race.
    const rows = await prisma.appointment.findMany({ where: { availability_id: slot.id } });
    assert.equal(rows.length, 1, 'exactly one appointment survives the race');
    assert.equal(rows[0].id, winner.body.data.id);
    assert.equal(rows[0].status, 'PENDING');

    const slotRow = await prisma.availability.findUnique({ where: { id: slot.id } });
    assert.equal(slotRow.status, 'BOOKED', 'the winning transaction holds the slot');

    const loserPatientId = await patientRowFor(
      responseA.status === 201 ? patB.userId : patA.userId
    );
    assert.notEqual(rows[0].patient_id, loserPatientId.id, 'the loser owns nothing');
  });
});

describe('GET /api/v1/appointments/me', () => {
  it('returns only the authenticated patient appointments, paginated and filterable', async () => {
    const drX = await createDoctorAccount(spec.id, 'Dr. List X');
    const drY = await createDoctorAccount(spec.id, 'Dr. List Y');
    const patMine = await createPatientAccount('Pat Mine');
    const patOther = await createPatientAccount('Pat Other');
    const drXId = (await doctorRowFor(drX.userId)).id;
    const drYId = (await doctorRowFor(drY.userId)).id;
    const patMineId = (await patientRowFor(patMine.userId)).id;
    const patOtherId = (await patientRowFor(patOther.userId)).id;

    // Two appointments for the probed patient (different doctors), two for
    // another patient, one cancelled one for pagination/filtering checks.
    const a1 = await seedBookedAppointment({
      doctorId: drXId,
      patientId: patMineId,
      date: FUTURE_DATE,
      startTime: '08:00',
      endTime: '09:00',
    });
    const a2 = await seedBookedAppointment({
      doctorId: drYId,
      patientId: patMineId,
      date: FUTURE_DATE,
      startTime: '09:00',
      endTime: '10:00',
    });
    const a3 = await seedBookedAppointment({
      doctorId: drXId,
      patientId: patMineId,
      date: addDays(FUTURE_DATE, 1),
      startTime: '08:00',
      endTime: '09:00',
      status: 'CANCELLED',
    });
    await prisma.availability.update({ where: { id: a3.slot.id }, data: { status: 'AVAILABLE' } });
    await seedBookedAppointment({
      doctorId: drXId,
      patientId: patOtherId,
      date: FUTURE_DATE,
      startTime: '10:00',
      endTime: '11:00',
    });

    const response = await listMineRequest({}, patMine.accessToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.deepEqual(Object.keys(response.body).sort(), ['data', 'meta', 'status']);

    // Ordered by slot date then start time; other patients' rows excluded by SQL.
    assert.deepEqual(
      response.body.data.map((a) => `${a.availability.date} ${a.availability.startTime}`),
      [`${FUTURE_DATE} 08:00`, `${FUTURE_DATE} 09:00`, `${addDays(FUTURE_DATE, 1)} 08:00`]
    );
    assert.ok(response.body.data.every((a) => a.patient.id === patMineId));
    assert.deepEqual(response.body.meta, { page: 1, limit: 10, total: 3, totalPages: 1 });

    // Pagination slice.
    const page1 = await listMineRequest({ page: 1, limit: 2 }, patMine.accessToken);
    assert.deepEqual(page1.body.meta, { page: 1, limit: 2, total: 3, totalPages: 2 });
    assert.equal(page1.body.data.length, 2);

    // Status filter applies in the database query.
    const cancelledOnly = await listMineRequest({ status: 'CANCELLED' }, patMine.accessToken);
    assert.equal(cancelledOnly.body.data.length, 1);
    assert.equal(cancelledOnly.body.data[0].id, a3.appointment.id);
    assert.equal(cancelledOnly.body.meta.total, 1);

    const confirmedOnly = await listMineRequest({ status: 'CONFIRMED' }, patMine.accessToken);
    assert.deepEqual(confirmedOnly.body.data, []);
    assert.equal(confirmedOnly.body.meta.total, 0);
  });

  it('returns only the authenticated doctor appointments', async () => {
    const drMine = await createDoctorAccount(spec.id, 'Dr. Mine');
    const drOther = await createDoctorAccount(spec.id, 'Dr. Other');
    const pat = await createPatientAccount('Pat Shared');
    const drMineId = (await doctorRowFor(drMine.userId)).id;
    const drOtherId = (await doctorRowFor(drOther.userId)).id;
    const patId = (await patientRowFor(pat.userId)).id;

    const mine = await seedBookedAppointment({
      doctorId: drMineId,
      patientId: patId,
      date: FUTURE_DATE,
      startTime: '15:00',
      endTime: '16:00',
    });
    await seedBookedAppointment({
      doctorId: drOtherId,
      patientId: patId,
      date: FUTURE_DATE,
      startTime: '16:00',
      endTime: '17:00',
    });

    const response = await listMineRequest({}, drMine.accessToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].id, mine.appointment.id);
    assert.ok(response.body.data.every((a) => a.doctor.id === drMineId));
  });

  it('enforces authentication and roles', async () => {
    const anonymous = await listMineRequest({});
    assert.equal(anonymous.status, 401);

    const adminAttempt = await listMineRequest({}, admin.accessToken);
    assert.equal(adminAttempt.status, 403);
    assert.equal(adminAttempt.body.status, 'forbidden');
  });

  it('rejects invalid query parameters with 400', async () => {
    const patient = await createPatientAccount('Pat Query Validation');
    for (const badQuery of [
      { page: 0 },
      { page: 'abc' },
      { limit: 0 },
      { limit: 101 },
      { status: 'NOT_A_STATUS' },
      { status: 'pending' },
    ]) {
      const response = await listMineRequest(badQuery, patient.accessToken);
      assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(badQuery)}`);
      assert.equal(response.body.status, 'validation_error');
    }
  });
});

describe('GET /api/v1/appointments/:id', () => {
  let doctor;
  let patient;
  let appointmentId;
  let foreignDoctorToken;

  before(async () => {
    doctor = await createDoctorAccount(spec.id, 'Dr. Detail');
    patient = await createPatientAccount('Pat Detail Owner');
    const otherDoctor = await createDoctorAccount(spec.id, 'Dr. Stranger');
    foreignDoctorToken = otherDoctor.accessToken;

    const seeded = await seedBookedAppointment({
      doctorId: (await doctorRowFor(doctor.userId)).id,
      patientId: (await patientRowFor(patient.userId)).id,
      date: FUTURE_DATE,
      startTime: '17:00',
      endTime: '18:00',
    });
    appointmentId = seeded.appointment.id;
  });

  it('lets the owning patient view the appointment', async () => {
    const response = await getAppointmentRequest(appointmentId, patient.accessToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, appointmentId);
    assert.equal(response.body.data.status, 'PENDING');
    assert.deepEqual(Object.keys(response.body.data.availability).sort(), [
      'date',
      'endTime',
      'id',
      'startTime',
    ]);
  });

  it('lets the owning doctor view the appointment', async () => {
    const response = await getAppointmentRequest(appointmentId, doctor.accessToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, appointmentId);
  });

  it('lets ADMIN view any appointment', async () => {
    const response = await getAppointmentRequest(appointmentId, admin.accessToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, appointmentId);
  });

  it("returns 403 to another patient and never leaks the appointment", async () => {
    const stranger = await createPatientAccount('Pat Snoop');
    const response = await getAppointmentRequest(appointmentId, stranger.accessToken);
    assert.equal(response.status, 403);
    assert.equal(response.body.status, 'forbidden');
    assert.equal(response.body.data, undefined);
    assert.ok(!JSON.stringify(response.body).includes(appointmentId));
  });

  it('returns 403 to another doctor', async () => {
    const response = await getAppointmentRequest(appointmentId, foreignDoctorToken);
    assert.equal(response.status, 403);
    assert.equal(response.body.status, 'forbidden');
  });

  it('returns 404 for a missing appointment and 400 for a malformed id', async () => {
    const missing = await getAppointmentRequest(randomUUID(), patient.accessToken);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.message, 'Appointment not found');

    const malformed = await getAppointmentRequest('not-a-uuid', patient.accessToken);
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.status, 'validation_error');
  });

  it('requires authentication (401)', async () => {
    const response = await getAppointmentRequest(appointmentId);
    assert.equal(response.status, 401);
  });
});

describe('PATCH /api/v1/appointments/:id/status — valid transitions', () => {
  it('CONFIRMS a PENDING appointment by the owning doctor', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Confirm');
    const patient = await createPatientAccount('Pat Confirm');
    const doctorId = (await doctorRowFor(doctor.userId)).id;
    const patientId = (await patientRowFor(patient.userId)).id;
    const { appointment } = await seedBookedAppointment({
      doctorId,
      patientId,
      date: FUTURE_DATE,
      startTime: '09:00',
      endTime: '10:00',
    });

    const response = await statusRequest(appointment.id, 'CONFIRMED', doctor.accessToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'CONFIRMED');

    const row = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    assert.equal(row.status, 'CONFIRMED');

    // The slot stays BOOKED across non-cancellation transitions.
    const slotRow = await prisma.availability.findUnique({
      where: { id: appointment.availability_id },
    });
    assert.equal(slotRow.status, 'BOOKED');
  });

  it('COMPLETES a CONFIRMED appointment by the owning doctor', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Complete');
    const patient = await createPatientAccount('Pat Complete');
    const doctorId = (await doctorRowFor(doctor.userId)).id;
    const patientId = (await patientRowFor(patient.userId)).id;
    const { appointment } = await seedBookedAppointment({
      doctorId,
      patientId,
      date: FUTURE_DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: 'CONFIRMED',
    });

    const response = await statusRequest(appointment.id, 'COMPLETED', doctor.accessToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'COMPLETED');

    const row = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    assert.equal(row.status, 'COMPLETED');
  });

  it('lets the owning DOCTOR cancel: appointment CANCELLED + slot released atomically', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Cancel Own');
    const patient = await createPatientAccount('Pat DoctorCancel');
    const doctorId = (await doctorRowFor(doctor.userId)).id;
    const patientId = (await patientRowFor(patient.userId)).id;
    const { appointment } = await seedBookedAppointment({
      doctorId,
      patientId,
      date: FUTURE_DATE,
      startTime: '11:00',
      endTime: '12:00',
    });

    const response = await statusRequest(appointment.id, 'CANCELLED', doctor.accessToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'CANCELLED');

    const row = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    assert.equal(row.status, 'CANCELLED');
    assert.ok(row, 'cancelled appointments are retained as history');

    const slotRow = await prisma.availability.findUnique({
      where: { id: appointment.availability_id },
    });
    assert.equal(slotRow.status, 'AVAILABLE', 'cancellation must release the slot');
  });

  it('lets the PATIENT cancel their own appointment and release the slot', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. PatCancel');
    const patient = await createPatientAccount('Pat Cancels');
    const doctorId = (await doctorRowFor(doctor.userId)).id;
    const patientId = (await patientRowFor(patient.userId)).id;
    const { appointment } = await seedBookedAppointment({
      doctorId,
      patientId,
      date: FUTURE_DATE,
      startTime: '12:00',
      endTime: '13:00',
      status: 'CONFIRMED',
    });

    const response = await statusRequest(appointment.id, 'CANCELLED', patient.accessToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'CANCELLED');

    const row = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    assert.equal(row.status, 'CANCELLED');

    const slotRow = await prisma.availability.findUnique({
      where: { id: appointment.availability_id },
    });
    assert.equal(slotRow.status, 'AVAILABLE');
  });

  it('allows rebooking a released slot while cancelled history is retained', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Rebook');
    const patFirst = await createPatientAccount('Pat First');
    const patSecond = await createPatientAccount('Pat Second');
    const doctorId = (await doctorRowFor(doctor.userId)).id;
    const slot = await seedSlot(doctorId, FUTURE_DATE, '14:00', '15:00');

    const first = await bookRequest({ availabilityId: slot.id }, patFirst.accessToken);
    assert.equal(first.status, 201);

    const cancel = await statusRequest(first.body.data.id, 'CANCELLED', patFirst.accessToken);
    assert.equal(cancel.status, 200);

    // The cancelled history remains queryable.
    const history = await prisma.appointment.findUnique({ where: { id: first.body.data.id } });
    assert.equal(history.status, 'CANCELLED', 'cancelled appointment must not be deleted');

    // The released slot can be booked again — by the same or another patient.
    const second = await bookRequest(
      { availabilityId: slot.id },
      patSecond.accessToken
    );
    assert.equal(second.status, 201);
    assert.notEqual(second.body.data.id, first.body.data.id);

    const rows = await prisma.appointment.findMany({ where: { availability_id: slot.id } });
    assert.equal(rows.length, 2, 'history plus the new active appointment');
    const active = rows.filter((r) => r.status !== 'CANCELLED');
    assert.equal(active.length, 1, 'exactly one active appointment for the slot');
    assert.equal(active[0].id, second.body.data.id);

    const slotRow = await prisma.availability.findUnique({ where: { id: slot.id } });
    assert.equal(slotRow.status, 'BOOKED');
  });
});

describe('PATCH /api/v1/appointments/:id/status — invalid transitions', () => {
  // Each case seeds its own appointment and asserts 409 with no state change.
  const expectInvalidTransition = async ({ fromStatus, toStatus, actor }) => {
    const doctor = await createDoctorAccount(spec.id, `Dr. Inv ${fromStatus}${toStatus}`);
    const patient = await createPatientAccount(`Pat Inv ${fromStatus}${toStatus}`);
    const doctorId = (await doctorRowFor(doctor.userId)).id;
    const patientId = (await patientRowFor(patient.userId)).id;
    const { appointment } = await seedBookedAppointment({
      doctorId,
      patientId,
      date: FUTURE_DATE,
      startTime: '15:00',
      endTime: '16:00',
      status: fromStatus,
    });

    const token = actor === 'PATIENT' ? patient.accessToken : doctor.accessToken;
    const response = await statusRequest(appointment.id, toStatus, token);

    assert.equal(response.status, 409, `${fromStatus} → ${toStatus} must be rejected`);
    assert.equal(response.body.status, 'conflict');

    const row = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    assert.equal(row.status, fromStatus, 'a rejected transition must not change the status');
    return { appointment };
  };

  it('rejects COMPLETED → CANCELLED with 409', async () => {
    await expectInvalidTransition({ fromStatus: 'COMPLETED', toStatus: 'CANCELLED', actor: 'DOCTOR' });
  });

  it('rejects COMPLETED → CONFIRMED with 409', async () => {
    await expectInvalidTransition({ fromStatus: 'COMPLETED', toStatus: 'CONFIRMED', actor: 'DOCTOR' });
  });

  it('rejects CANCELLED → CONFIRMED with 409', async () => {
    await expectInvalidTransition({ fromStatus: 'CANCELLED', toStatus: 'CONFIRMED', actor: 'DOCTOR' });
  });

  it('rejects CANCELLED → COMPLETED with 409', async () => {
    await expectInvalidTransition({ fromStatus: 'CANCELLED', toStatus: 'COMPLETED', actor: 'DOCTOR' });
  });

  it('rejects CANCELLED → CANCELLED with 409 (terminal state)', async () => {
    await expectInvalidTransition({ fromStatus: 'CANCELLED', toStatus: 'CANCELLED', actor: 'PATIENT' });
  });

  it('rejects PENDING → PENDING-style no-op requests via validator (400)', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. PendingReq');
    const patient = await createPatientAccount('Pat PendingReq');
    const { appointment } = await seedBookedAppointment({
      doctorId: (await doctorRowFor(doctor.userId)).id,
      patientId: (await patientRowFor(patient.userId)).id,
      date: FUTURE_DATE,
      startTime: '16:00',
      endTime: '17:00',
    });

    // PENDING is not a requestable status at all — appointments start there.
    const response = await statusRequest(appointment.id, 'PENDING', doctor.accessToken);
    assert.equal(response.status, 400);
    assert.equal(response.body.status, 'validation_error');
  });
});

describe('PATCH /api/v1/appointments/:id/status — role and ownership rules', () => {
  it("returns 403 when a PATIENT tries to confirm or complete", async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. RoleGuard');
    const patient = await createPatientAccount('Pat RoleGuard');
    const confirmed = await seedBookedAppointment({
      doctorId: (await doctorRowFor(doctor.userId)).id,
      patientId: (await patientRowFor(patient.userId)).id,
      date: FUTURE_DATE,
      startTime: '17:00',
      endTime: '18:00',
    });

    const confirmAttempt = await statusRequest(
      confirmed.appointment.id,
      'CONFIRMED',
      patient.accessToken
    );
    assert.equal(confirmAttempt.status, 403);

    const completeAttempt = await statusRequest(
      confirmed.appointment.id,
      'COMPLETED',
      patient.accessToken
    );
    assert.equal(completeAttempt.status, 403);

    const row = await prisma.appointment.findUnique({ where: { id: confirmed.appointment.id } });
    assert.equal(row.status, 'PENDING', "patient's forbidden attempts must not change status");
  });

  it("returns 403 when another PATIENT tries to cancel someone else's appointment", async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. CrossPat');
    const owner = await createPatientAccount('Pat Owner');
    const stranger = await createPatientAccount('Pat Stranger Cancel');
    const seeded = await seedBookedAppointment({
      doctorId: (await doctorRowFor(doctor.userId)).id,
      patientId: (await patientRowFor(owner.userId)).id,
      date: FUTURE_DATE,
      startTime: '18:00',
      endTime: '19:00',
    });

    const response = await statusRequest(seeded.appointment.id, 'CANCELLED', stranger.accessToken);
    assert.equal(response.status, 403);
    assert.equal(response.body.status, 'forbidden');

    const row = await prisma.appointment.findUnique({ where: { id: seeded.appointment.id } });
    assert.equal(row.status, 'PENDING');
    const slotRow = await prisma.availability.findUnique({ where: { id: seeded.slot.id } });
    assert.equal(slotRow.status, 'BOOKED');
  });

  it("returns 403 when another DOCTOR tries to manage someone else's appointment", async () => {
    const owner = await createDoctorAccount(spec.id, 'Dr. Owner Appt');
    const stranger = await createDoctorAccount(spec.id, 'Dr. Stranger Appt');
    const patient = await createPatientAccount('Pat CrossDoc');
    const seeded = await seedBookedAppointment({
      doctorId: (await doctorRowFor(owner.userId)).id,
      patientId: (await patientRowFor(patient.userId)).id,
      date: FUTURE_DATE,
      startTime: '19:00',
      endTime: '20:00',
    });

    for (const attempted of ['CONFIRMED', 'CANCELLED']) {
      const response = await statusRequest(seeded.appointment.id, attempted, stranger.accessToken);
      assert.equal(response.status, 403, `foreign doctor ${attempted} must be rejected`);
    }

    const row = await prisma.appointment.findUnique({ where: { id: seeded.appointment.id } });
    assert.equal(row.status, 'PENDING');
  });

  it('returns 403 to ADMIN on PATCH /status (read-only oversight)', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. AdminRO');
    const patient = await createPatientAccount('Pat AdminRO');
    const seeded = await seedBookedAppointment({
      doctorId: (await doctorRowFor(doctor.userId)).id,
      patientId: (await patientRowFor(patient.userId)).id,
      date: FUTURE_DATE,
      startTime: '20:00',
      endTime: '21:00',
    });

    const response = await statusRequest(seeded.appointment.id, 'CONFIRMED', admin.accessToken);
    assert.equal(response.status, 403);
  });

  it('requires authentication (401) and rejects malformed input (400)', async () => {
    const anonymous = await statusRequest(randomUUID(), 'CONFIRMED');
    assert.equal(anonymous.status, 401);

    const doctor = await createDoctorAccount(spec.id, 'Dr. StatusValidation');
    const badIdResponse = await statusRequest('not-a-uuid', 'CONFIRMED', doctor.accessToken);
    assert.equal(badIdResponse.status, 400);

    const missingResponse = await statusRequest(randomUUID(), 'CONFIRMED', doctor.accessToken);
    assert.equal(missingResponse.status, 404);
    assert.equal(missingResponse.body.message, 'Appointment not found');

    const patient = await createPatientAccount('Pat StatusValidation');
    const seeded = await seedBookedAppointment({
      doctorId: (await doctorRowFor(doctor.userId)).id,
      patientId: (await patientRowFor(patient.userId)).id,
      date: FUTURE_DATE,
      startTime: '21:00',
      endTime: '22:00',
    });

    for (const badStatus of ['NOT_A_STATUS', 'pending', '', 42, null]) {
      const response = await statusRequest(seeded.appointment.id, badStatus, doctor.accessToken);
      assert.equal(response.status, 400, `expected 400 for status ${JSON.stringify(badStatus)}`);
      assert.equal(response.body.status, 'validation_error');
    }
  });
});

describe('past appointments (Africa/Cairo clinic time)', () => {
  it('lets the owning doctor mark a past CONFIRMED appointment COMPLETED', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. PastComplete');
    const patient = await createPatientAccount('Pat PastComplete');
    const seeded = await seedBookedAppointment({
      doctorId: (await doctorRowFor(doctor.userId)).id,
      patientId: (await patientRowFor(patient.userId)).id,
      date: PAST_DATE,
      startTime: '09:00',
      endTime: '10:00',
      status: 'CONFIRMED',
    });

    const response = await statusRequest(seeded.appointment.id, 'COMPLETED', doctor.accessToken);
    assert.equal(response.status, 200, 'the documented doctor exception must work');
    assert.equal(response.body.data.status, 'COMPLETED');

    const row = await prisma.appointment.findUnique({ where: { id: seeded.appointment.id } });
    assert.equal(row.status, 'COMPLETED');
  });

  it('blocks the doctor exception for a past PENDING appointment (must be CONFIRMED)', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. PastPending');
    const patient = await createPatientAccount('Pat PastPending');
    const seeded = await seedBookedAppointment({
      doctorId: (await doctorRowFor(doctor.userId)).id,
      patientId: (await patientRowFor(patient.userId)).id,
      date: PAST_DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: 'PENDING',
    });

    const completeAttempt = await statusRequest(
      seeded.appointment.id,
      'COMPLETED',
      doctor.accessToken
    );
    assert.equal(completeAttempt.status, 409, 'past PENDING cannot jump straight to COMPLETED');

    const confirmAttempt = await statusRequest(
      seeded.appointment.id,
      'CONFIRMED',
      doctor.accessToken
    );
    assert.equal(confirmAttempt.status, 409, 'past appointments cannot be confirmed');

    const row = await prisma.appointment.findUnique({ where: { id: seeded.appointment.id } });
    assert.equal(row.status, 'PENDING');
  });

  it("blocks a patient from cancelling a past appointment", async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. PastPatientCancel');
    const patient = await createPatientAccount('Pat PastCancel');
    const seeded = await seedBookedAppointment({
      doctorId: (await doctorRowFor(doctor.userId)).id,
      patientId: (await patientRowFor(patient.userId)).id,
      date: PAST_DATE,
      startTime: '11:00',
      endTime: '12:00',
      status: 'CONFIRMED',
    });

    const response = await statusRequest(seeded.appointment.id, 'CANCELLED', patient.accessToken);
    assert.equal(response.status, 409);
    assert.equal(response.body.status, 'conflict');

    const row = await prisma.appointment.findUnique({ where: { id: seeded.appointment.id } });
    assert.equal(row.status, 'CONFIRMED', 'past cancellation must be refused');
    const slotRow = await prisma.availability.findUnique({ where: { id: seeded.slot.id } });
    assert.equal(slotRow.status, 'BOOKED', 'the past slot must stay booked');
  });

  it("blocks a doctor from cancelling a past appointment", async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. PastDocCancel');
    const patient = await createPatientAccount('Pat PastDocCancel');
    const seeded = await seedBookedAppointment({
      doctorId: (await doctorRowFor(doctor.userId)).id,
      patientId: (await patientRowFor(patient.userId)).id,
      date: PAST_DATE,
      startTime: '12:00',
      endTime: '13:00',
      status: 'CONFIRMED',
    });

    const response = await statusRequest(seeded.appointment.id, 'CANCELLED', doctor.accessToken);
    assert.equal(response.status, 409, 'past appointments are immutable except completion');

    const row = await prisma.appointment.findUnique({ where: { id: seeded.appointment.id } });
    assert.equal(row.status, 'CONFIRMED');
  });

  it('still allows cancelling future appointments (control case)', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. FutureControl');
    const patient = await createPatientAccount('Pat FutureControl');
    const seeded = await seedBookedAppointment({
      doctorId: (await doctorRowFor(doctor.userId)).id,
      patientId: (await patientRowFor(patient.userId)).id,
      date: FUTURE_DATE,
      startTime: '08:00',
      endTime: '09:00',
    });

    const response = await statusRequest(seeded.appointment.id, 'CANCELLED', patient.accessToken);
    assert.equal(response.status, 200);
  });
});

describe('database partial unique index (double-booking backstop)', () => {
  it('exists as a partial unique index excluding CANCELLED rows', async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename = 'Appointment' AND indexname = 'Appointment_active_availability_key'`
    );

    assert.equal(rows.length, 1, 'the partial unique index must exist');
    assert.match(rows[0].indexdef, /UNIQUE INDEX/i);
    assert.match(rows[0].indexdef, /availability_id/);
    // pg renders the predicate with an enum cast, e.g. status <> 'CANCELLED'::"AppointmentStatus"
    assert.match(rows[0].indexdef, /WHERE[\s\S]*status <> 'CANCELLED'/i);

    // The old plain unique constraint must be gone.
    const oldIndex = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM pg_indexes WHERE tablename = 'Appointment' AND indexname = 'Appointment_availability_id_key'`
    );
    assert.equal(oldIndex.length, 0, 'the old availability_id unique index must be dropped');
  });

  it('rejects two ACTIVE appointments for one slot even when services are bypassed', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. DBBackstop');
    const patA = await createPatientAccount('Pat DB A');
    const patB = await createPatientAccount('Pat DB B');
    const doctorId = (await doctorRowFor(doctor.userId)).id;

    const slot = await seedSlot(doctorId, FUTURE_DATE, '10:00', '11:00', 'BOOKED');
    await prisma.appointment.create({
      data: {
        availability_id: slot.id,
        doctor_id: doctorId,
        patient_id: (await patientRowFor(patA.userId)).id,
        status: 'CONFIRMED',
      },
    });

    await assert.rejects(
      prisma.appointment.create({
        data: {
          availability_id: slot.id,
          doctor_id: doctorId,
          patient_id: (await patientRowFor(patB.userId)).id,
          status: 'PENDING',
        },
      }),
      // Prisma maps the violated partial unique index to P2002.
      (error) => error.code === 'P2002'
    );

    // The same slot tolerates any number of cancelled rows next to the active one.
    await prisma.appointment.create({
      data: {
        availability_id: slot.id,
        doctor_id: doctorId,
        patient_id: (await patientRowFor(patB.userId)).id,
        status: 'CANCELLED',
      },
    });

    const rows = await prisma.appointment.findMany({ where: { availability_id: slot.id } });
    assert.equal(rows.length, 2, 'one active + one cancelled coexist');
    assert.equal(rows.filter((r) => r.status !== 'CANCELLED').length, 1);
  });
});
