/**
 * Milestone 12 — Availability & Scheduling integration tests.
 *
 * Follows the M8/M10/M11 conventions: real app + real PostgreSQL via
 * setupTestDatabase/teardownTestDatabase, supertest requests, direct
 * Prisma assertions for persistence, serial file execution.
 *
 * Doctors are seeded through the public registration API (the production
 * path that creates the User + Doctor pair). BOOKED slots are produced by
 * flipping the status of a created slot directly — the booking API is
 * Milestone 13 scope, so this is the only way to reach that state on demand
 * (same precedent as the auth suite's insertRefreshToken helper).
 */
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import app from '../../src/app.js';
import { setupTestDatabase, teardownTestDatabase, prisma } from '../helpers/db.js';
import {
  TEST_PASSWORD,
  createSpecialty,
  createAdmin,
  createAuthenticatedUser,
  uniqueEmail,
} from '../helpers/auth.js';

const BASE = '/api/v1/doctors';

const listRequest = (doctorId, query) =>
  request(app).get(`${BASE}/${doctorId}/availability`).query(query ?? {});
const createRequest = (body, token) =>
  request(app).post(`${BASE}/me/availability`).send(body).auth(token ?? '', { type: 'bearer' });
const deleteRequest = (id, token) =>
  request(app).delete(`${BASE}/me/availability/${id}`).auth(token ?? '', { type: 'bearer' });

/** Convenience: a logged-in DOCTOR account on the given specialty. */
const createDoctorAccount = (specialtyId, fullName) =>
  createAuthenticatedUser({ role: 'DOCTOR', specialtyId, fullName });

/** The Doctor profile row belonging to a registered user id. */
const doctorRowFor = (userId) => prisma.doctor.findUnique({ where: { user_id: userId } });

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

let admin;
let spec;

before(async () => {
  await setupTestDatabase();
  admin = await createAdmin();
  spec = await createSpecialty(`Availability Fixture ${randomUUID()}`);
});

after(teardownTestDatabase);

describe('POST /api/v1/doctors/me/availability', () => {
  it('lets a doctor create a slot and persists the exact clinic-local values', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Create');

    const response = await createRequest(
      { date: '2030-05-01', startTime: '09:30', endTime: '11:00' },
      doctor.accessToken
    );

    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'success');
    assert.deepEqual(Object.keys(response.body.data).sort(), ['date', 'endTime', 'id', 'startTime']);
    assert.equal(response.body.data.date, '2030-05-01');
    assert.equal(response.body.data.startTime, '09:30');
    assert.equal(response.body.data.endTime, '11:00');
    assert.match(response.body.data.id, /^[0-9a-f-]{36}$/);

    const row = await prisma.availability.findUnique({ where: { id: response.body.data.id } });
    assert.ok(row, 'slot must persist');
    assert.equal(row.doctor_id, (await doctorRowFor(doctor.userId)).id, 'slot belongs to the authenticated doctor');
    assert.equal(row.status, 'AVAILABLE', 'new slots default to AVAILABLE');
    assert.equal(row.date.toISOString(), '2030-05-01T00:00:00.000Z', 'calendar day must persist exactly');
    assert.equal(row.start_time.toISOString(), '1970-01-01T09:30:00.000Z', 'wall-clock start must persist exactly');
    assert.equal(row.end_time.toISOString(), '1970-01-01T11:00:00.000Z', 'wall-clock end must persist exactly');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const response = await createRequest({ date: '2030-05-01', startTime: '09:00', endTime: '10:00' });
    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'unauthorized');
  });

  it('rejects PATIENT and ADMIN roles with 403', async () => {
    const patient = await createAuthenticatedUser({ role: 'PATIENT' });
    const patientAttempt = await createRequest(
      { date: '2030-05-01', startTime: '09:00', endTime: '10:00' },
      patient.accessToken
    );
    assert.equal(patientAttempt.status, 403);
    assert.equal(patientAttempt.body.status, 'forbidden');

    const adminAttempt = await createRequest(
      { date: '2030-05-01', startTime: '09:00', endTime: '10:00' },
      admin.accessToken
    );
    assert.equal(adminAttempt.status, 403);
    assert.equal(adminAttempt.body.status, 'forbidden');
  });

  it('rejects invalid dates and times with 400', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Validation');

    for (const badBody of [
      { date: '01-02-2030', startTime: '09:00', endTime: '10:00' },
      { date: '2030/05/01', startTime: '09:00', endTime: '10:00' },
      { date: '2030-02-30', startTime: '09:00', endTime: '10:00' },
      { date: '2030-05', startTime: '09:00', endTime: '10:00' },
      { date: 20300501, startTime: '09:00', endTime: '10:00' },
      { date: '', startTime: '09:00', endTime: '10:00' },
      { date: '2030-05-01', startTime: '9:00', endTime: '10:00' },
      { date: '2030-05-01', startTime: '09:60', endTime: '10:00' },
      { date: '2030-05-01', startTime: '24:00', endTime: '10:30' },
      { date: '2030-05-01', startTime: '0900', endTime: '10:00' },
      { date: '2030-05-01', startTime: '', endTime: '10:00' },
      { date: '2030-05-01', startTime: '09:00', endTime: 'not-a-time' },
      {},
    ]) {
      const response = await createRequest(badBody, doctor.accessToken);
      assert.equal(response.status, 400, `expected 400 for body ${JSON.stringify(badBody)}`);
      assert.equal(response.body.status, 'validation_error');
      assert.ok(Array.isArray(response.body.errors));
    }
  });

  it('rejects endTime equal to or earlier than startTime with 400', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. TimeRange');

    for (const badRange of [
      { date: '2030-05-02', startTime: '10:00', endTime: '10:00' },
      { date: '2030-05-02', startTime: '11:00', endTime: '10:00' },
    ]) {
      const response = await createRequest(badRange, doctor.accessToken);
      assert.equal(response.status, 400);
      assert.equal(response.body.status, 'validation_error');
    }

    const rows = await prisma.availability.findMany({
      where: { doctor_id: (await doctorRowFor(doctor.userId)).id },
    });
    assert.equal(rows.length, 0, 'rejected ranges must not persist');
  });

  it('ignores a client-supplied doctorId instead of trusting it', async () => {
    const drA = await createDoctorAccount(spec.id, 'Dr. Forger Slot');
    const drB = await createDoctorAccount(spec.id, 'Dr. Target Slot');
    const rowB = await doctorRowFor(drB.userId);

    // Zod strips unknown fields, so the forged ownership claim has no effect.
    const response = await createRequest(
      { date: '2030-06-01', startTime: '08:00', endTime: '09:00', doctorId: rowB.id },
      drA.accessToken
    );

    assert.equal(response.status, 201);
    const row = await prisma.availability.findUnique({ where: { id: response.body.data.id } });
    assert.equal(row.doctor_id, (await doctorRowFor(drA.userId)).id, 'slot must belong to the caller');
    assert.notEqual(row.doctor_id, rowB.id);
  });
});

describe('overlap prevention (POST /doctors/me/availability)', () => {
  it('applies the documented rule against an existing 09:00–10:00 slot', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Overlap');
    const doctorId = (await doctorRowFor(doctor.userId)).id;
    await seedSlot(doctorId, '2030-07-01', '09:00', '10:00');

    // Reject: strict overlap cases.
    for (const [startTime, endTime] of [
      ['09:30', '10:30'], // overlaps tail
      ['08:30', '09:30'], // overlaps head
      ['08:00', '11:00'], // envelopes
    ]) {
      const response = await createRequest(
        { date: '2030-07-01', startTime, endTime },
        doctor.accessToken
      );
      assert.equal(response.status, 409, `expected 409 for ${startTime}-${endTime}`);
      assert.equal(response.body.status, 'conflict');
    }

    // Allow: adjacent cases.
    for (const [startTime, endTime] of [
      ['10:00', '11:00'], // starts exactly when existing ends
      ['08:00', '09:00'], // ends exactly when existing starts
    ]) {
      const response = await createRequest(
        { date: '2030-07-01', startTime, endTime },
        doctor.accessToken
      );
      assert.equal(response.status, 201, `expected 201 for adjacent ${startTime}-${endTime}`);
    }

    const rows = await prisma.availability.findMany({ where: { doctor_id: doctorId } });
    assert.equal(rows.length, 3, 'seeded slot plus the two adjacent creations');
  });

  it('scopes the check to the same doctor: two doctors may hold identical slots', async () => {
    const drA = await createDoctorAccount(spec.id, 'Dr. Same A');
    const drB = await createDoctorAccount(spec.id, 'Dr. Same B');
    const rowA = await doctorRowFor(drA.userId);
    const rowB = await doctorRowFor(drB.userId);

    await seedSlot(rowA.id, '2030-07-02', '14:00', '15:00');

    const response = await createRequest(
      { date: '2030-07-02', startTime: '14:00', endTime: '15:00' },
      drB.accessToken
    );

    assert.equal(response.status, 201, "another doctor's identical slot must not conflict");
  });

  it('scopes the check to the same date: identical times on another date are fine', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Other Day');
    const doctorId = (await doctorRowFor(doctor.userId)).id;

    await seedSlot(doctorId, '2030-07-03', '16:00', '17:00');

    const response = await createRequest(
      { date: '2030-07-04', startTime: '16:00', endTime: '17:00' },
      doctor.accessToken
    );

    assert.equal(response.status, 201, 'the same time on a different date must not conflict');
  });
});

describe('GET /api/v1/doctors/:doctorId/availability', () => {
  let doctor;
  let doctorId;

  before(async () => {
    doctor = await createDoctorAccount(spec.id, 'Dr. Listing');
    doctorId = (await doctorRowFor(doctor.userId)).id;

    // Slots across three dates; one booked slot that must never be exposed.
    await seedSlot(doctorId, '2030-08-01', '09:00', '10:00');
    await seedSlot(doctorId, '2030-08-02', '09:00', '10:00');
    await seedSlot(doctorId, '2030-08-02', '11:00', '12:00');
    await seedSlot(doctorId, '2030-08-03', '13:00', '14:00');
    await seedSlot(doctorId, '2030-08-02', '15:00', '16:00', 'BOOKED');
  });

  it('allows anonymous access and returns only AVAILABLE slots in order', async () => {
    const response = await listRequest(doctorId);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.ok(Array.isArray(response.body.data));
    assert.deepEqual(Object.keys(response.body).sort(), ['data', 'status']);

    assert.equal(response.body.data.length, 4, 'BOOKED slot must be excluded');
    for (const slot of response.body.data) {
      assert.deepEqual(Object.keys(slot).sort(), ['date', 'endTime', 'id', 'startTime']);
    }
    assert.deepEqual(
      response.body.data.map((s) => `${s.date} ${s.startTime}`),
      ['2030-08-01 09:00', '2030-08-02 09:00', '2030-08-02 11:00', '2030-08-03 13:00'],
      'slots ordered by date then start time'
    );
  });

  it('filters with from only (inclusive lower bound)', async () => {
    const response = await listRequest(doctorId, { from: '2030-08-02' });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.data.map((s) => `${s.date} ${s.startTime}`),
      ['2030-08-02 09:00', '2030-08-02 11:00', '2030-08-03 13:00']
    );
  });

  it('filters with to only (inclusive upper bound)', async () => {
    const response = await listRequest(doctorId, { to: '2030-08-02' });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.data.map((s) => `${s.date} ${s.startTime}`),
      ['2030-08-01 09:00', '2030-08-02 09:00', '2030-08-02 11:00']
    );
  });

  it('filters with from + to as an inclusive range', async () => {
    const response = await listRequest(doctorId, { from: '2030-08-02', to: '2030-08-02' });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.data.map((s) => `${s.date} ${s.startTime}`),
      ['2030-08-02 09:00', '2030-08-02 11:00']
    );
  });

  it('never exposes booked slots under any filter combination', async () => {
    const response = await listRequest(doctorId, { from: '2030-07-01', to: '2030-12-31' });

    assert.equal(response.status, 200);
    const serialized = JSON.stringify(response.body.data);
    assert.ok(!serialized.includes('"15:00"'), 'booked slot start must not appear');
    assert.ok(!serialized.includes('"16:00"'), 'booked slot end must not appear');

    const bookedRows = await prisma.availability.findMany({
      where: { doctor_id: doctorId, status: 'BOOKED' },
    });
    assert.equal(bookedRows.length, 1, 'fixture sanity: the booked row exists but is filtered out');
  });

  it('returns an empty list (not an error) when nothing matches', async () => {
    const emptyResponse = await listRequest(doctorId, { from: '2099-01-01' });
    assert.equal(emptyResponse.status, 200);
    assert.deepEqual(emptyResponse.body.data, []);

    const fresh = await createDoctorAccount(spec.id, 'Dr. NoSlots');
    const freshRow = await doctorRowFor(fresh.userId);
    const response = await listRequest(freshRow.id);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, []);
  });

  it('returns 404 for an unknown doctor UUID', async () => {
    const response = await listRequest(randomUUID());
    assert.equal(response.status, 404);
    assert.equal(response.body.status, 'not_found');
    assert.equal(response.body.message, 'Doctor not found');
  });

  it('returns 400 for malformed params or filters', async () => {
    for (const [path, query] of [
      ['not-a-uuid', {}],
      [doctorId, { from: '2030/08/01' }],
      [doctorId, { to: '2030-13-01' }],
      [doctorId, { from: '2030-08-10', to: '2030-08-01' }], // inverted range
    ]) {
      const response = await listRequest(path, query);
      assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(query)}`);
      assert.equal(response.body.status, 'validation_error');
      assert.ok(Array.isArray(response.body.errors));
    }
  });
});

describe('DELETE /api/v1/doctors/me/availability/:id', () => {
  it('lets a doctor delete their own available slot', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Delete Own');
    const created = await createRequest(
      { date: '2030-09-01', startTime: '08:00', endTime: '09:00' },
      doctor.accessToken
    );
    assert.equal(created.status, 201);
    const slotId = created.body.data.id;

    const response = await deleteRequest(slotId, doctor.accessToken);

    assert.equal(response.status, 204);
    assert.equal(response.text, '');

    const row = await prisma.availability.findUnique({ where: { id: slotId } });
    assert.equal(row, null, 'slot must be removed from the database');
  });

  it("returns 403 and keeps the slot when deleting another doctor's slot", async () => {
    const drA = await createDoctorAccount(spec.id, 'Dr. Owner Slot');
    const drB = await createDoctorAccount(spec.id, 'Dr. Stranger Slot');
    const rowA = await doctorRowFor(drA.userId);

    const target = await seedSlot(rowA.id, '2030-09-02', '10:00', '11:00');

    const response = await deleteRequest(target.id, drB.accessToken);

    assert.equal(response.status, 403);
    assert.equal(response.body.status, 'forbidden');

    const stillThere = await prisma.availability.findUnique({ where: { id: target.id } });
    assert.ok(stillThere, "another doctor's slot must not be deleted");
  });

  it('returns 409 and keeps the slot when deleting a booked slot', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Delete Booked');
    const doctorId = (await doctorRowFor(doctor.userId)).id;

    const target = await seedSlot(doctorId, '2030-09-03', '12:00', '13:00');
    await prisma.availability.update({ where: { id: target.id }, data: { status: 'BOOKED' } });

    const response = await deleteRequest(target.id, doctor.accessToken);

    assert.equal(response.status, 409);
    assert.equal(response.body.status, 'conflict');

    const stillThere = await prisma.availability.findUnique({ where: { id: target.id } });
    assert.ok(stillThere, 'a booked slot must not be deletable');
  });

  it('returns 404 for an unknown slot id', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Delete Missing');

    const response = await deleteRequest(randomUUID(), doctor.accessToken);

    assert.equal(response.status, 404);
    assert.equal(response.body.status, 'not_found');
  });

  it('requires authentication (401) and the DOCTOR role (403)', async () => {
    const patient = await createAuthenticatedUser({ role: 'PATIENT' });

    const anonymous = await deleteRequest(randomUUID());
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.status, 'unauthorized');

    const patientAttempt = await deleteRequest(randomUUID(), patient.accessToken);
    assert.equal(patientAttempt.status, 403);
    assert.equal(patientAttempt.body.status, 'forbidden');

    const adminAttempt = await deleteRequest(randomUUID(), admin.accessToken);
    assert.equal(adminAttempt.status, 403);
    assert.equal(adminAttempt.body.status, 'forbidden');
  });

  it('returns 400 for a malformed slot id', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Delete BadId');

    const response = await deleteRequest('not-a-uuid', doctor.accessToken);
    assert.equal(response.status, 400);
    assert.equal(response.body.status, 'validation_error');
    assert.ok(response.body.errors.some((issue) => issue.field.includes('id')));
  });
});

describe('database CHECK constraint (end_time > start_time)', () => {
  it('exists in the database as a validated constraint', async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT conname, pg_get_constraintdef(oid) AS def, convalidated
       FROM pg_constraint
       WHERE conrelid = '"Availability"'::regclass AND contype = 'c'`
    );

    const check = rows.find((r) => r.conname === 'Availability_end_time_check');
    assert.ok(check, 'Availability_end_time_check constraint must exist');
    assert.match(check.def, /end_time > start_time/i);
    assert.equal(check.convalidated, true);
  });

  it('rejects end_time <= start_time even when validation and service are bypassed', async () => {
    const doctor = await createDoctorAccount(spec.id, 'Dr. Constraint Probe');
    const doctorId = (await doctorRowFor(doctor.userId)).id;

    // Direct client writes skip the route validator and the service entirely.
    await assert.rejects(
      prisma.availability.create({
        data: {
          doctor_id: doctorId,
          date: new Date('2030-10-01T00:00:00.000Z'),
          start_time: new Date('1970-01-01T14:00:00.000Z'),
          end_time: new Date('1970-01-01T13:00:00.000Z'), // inverted
        },
      }),
      (error) => String(error.message).includes('Availability_end_time_check')
    );

    await assert.rejects(
      prisma.availability.create({
        data: {
          doctor_id: doctorId,
          date: new Date('2030-10-01T00:00:00.000Z'),
          start_time: new Date('1970-01-01T09:00:00.000Z'),
          end_time: new Date('1970-01-01T09:00:00.000Z'), // zero-length
        },
      }),
      (error) => String(error.message).includes('Availability_end_time_check')
    );

    const rows = await prisma.availability.findMany({ where: { doctor_id: doctorId } });
    assert.equal(rows.length, 0, 'invalid intervals must never be persisted');
  });
});
