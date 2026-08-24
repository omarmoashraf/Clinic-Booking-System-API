/**
 * Milestone 11 — Patients module integration tests
 * (PATCH /patients/me and GET /users/me).
 *
 * Follows the M8/M10 conventions: real app + real PostgreSQL via
 * setupTestDatabase/teardownTestDatabase, supertest requests, direct
 * Prisma assertions for persistence, serial file execution.
 *
 * Patients are seeded through the public registration API (the production
 * path that creates the User + Patient pair). The missing-profile cases
 * delete the profile row directly — the API has no legitimate way to reach
 * that state, so the integrity guard is exercised at the service boundary.
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
  registerRequest,
  uniqueEmail,
} from '../helpers/auth.js';

const BASE = '/api/v1';

const updateMeRequest = (body, token) =>
  request(app).patch(`${BASE}/patients/me`).send(body).auth(token ?? '', { type: 'bearer' });

const getMeRequest = (token) =>
  request(app).get(`${BASE}/users/me`).auth(token ?? '', { type: 'bearer' });

/** Register a PATIENT through the API (creates User + Patient) and log them in. */
const createPatientAccount = (overrides = {}) =>
  createAuthenticatedUser({ role: 'PATIENT', ...overrides });

/** Convenience: a logged-in DOCTOR account on the given specialty. */
const createDoctorAccount = (specialtyId, fullName) =>
  createAuthenticatedUser({ role: 'DOCTOR', specialtyId, fullName });

/** The Patient profile row belonging to a registered user id. */
const patientRowFor = (userId) => prisma.patient.findUnique({ where: { user_id: userId } });

let admin;

before(async () => {
  await setupTestDatabase();
  admin = await createAdmin();
});

after(teardownTestDatabase);

describe('PATCH /api/v1/patients/me', () => {
  it('lets a patient update their own profile and persists every field', async () => {
    const patient = await createPatientAccount({ fullName: 'Before Name' });
    const dob = '1995-06-15';

    const response = await updateMeRequest(
      { fullName: 'Updated Patient', phone: '+201000000001', dateOfBirth: dob },
      patient.accessToken
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.data.fullName, 'Updated Patient');
    assert.equal(response.body.data.phone, '+201000000001');
    assert.equal(response.body.data.patient.dateOfBirth, dob);

    const userRow = await prisma.user.findUnique({ where: { id: patient.userId } });
    assert.equal(userRow.full_name, 'Updated Patient', 'fullName lives on User and must persist');
    assert.equal(userRow.phone, '+201000000001', 'phone lives on User and must persist');

    const patientRow = await patientRowFor(patient.userId);
    assert.equal(patientRow.date_of_birth.toISOString(), `${dob}T00:00:00.000Z`,
      'dateOfBirth must persist as the exact calendar date');

    const refreshed = await getMeRequest(patient.accessToken);
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.body.data.patient.id, patientRow.id);
  });

  it('updates only the supplied field and leaves the others untouched', async () => {
    const patient = await createPatientAccount({ fullName: 'Partial Owner' });
    const originalDob = '1988-01-31';

    const seeded = await updateMeRequest(
      { fullName: 'Partial Owner', dateOfBirth: originalDob },
      patient.accessToken
    );
    assert.equal(seeded.status, 200);

    const response = await updateMeRequest({ phone: '+201111111111' }, patient.accessToken);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.phone, '+201111111111');
    assert.equal(response.body.data.fullName, 'Partial Owner', 'omitted fullName must not change');
    assert.equal(
      response.body.data.patient.dateOfBirth,
      originalDob,
      'omitted dateOfBirth must not change'
    );

    const patientRow = await patientRowFor(patient.userId);
    assert.equal(patientRow.date_of_birth.toISOString(), `${originalDob}T00:00:00.000Z`);
  });

  it('treats an empty body as a valid no-op returning the current profile', async () => {
    const patient = await createPatientAccount({ fullName: 'Noop Patient' });
    const before = await getMeRequest(patient.accessToken);

    const response = await updateMeRequest({}, patient.accessToken);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, before.body.data);
  });

  it('persists a valid dateOfBirth as a date-only value without timezone drift', async () => {
    const patient = await createPatientAccount();

    const response = await updateMeRequest({ dateOfBirth: '2000-02-29' }, patient.accessToken);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.patient.dateOfBirth, '2000-02-29');

    const patientRow = await patientRowFor(patient.userId);
    assert.equal(patientRow.date_of_birth.toISOString(), '2000-02-29T00:00:00.000Z');
  });

  it('rejects malformed dateOfBirth values with 400', async () => {
    const patient = await createPatientAccount();

    for (const badDate of [
      '15-05-1990',
      '1990/05/15',
      '1990-13-01',
      '1990-02-30',
      '1990-05',
      'not-a-date',
      19900515,
      '',
    ]) {
      const response = await updateMeRequest({ dateOfBirth: badDate }, patient.accessToken);
      assert.equal(response.status, 400, `expected 400 for dateOfBirth ${JSON.stringify(badDate)}`);
      assert.equal(response.body.status, 'validation_error');
      assert.ok(Array.isArray(response.body.errors));
    }

    const patientRow = await patientRowFor(patient.userId);
    assert.equal(patientRow.date_of_birth, null, 'failed validation must not write anything');
  });

  it('rejects invalid fullName and phone values with 400', async () => {
    const patient = await createPatientAccount();

    for (const badBody of [
      { fullName: '' },
      { fullName: '   ' },
      { fullName: 'x'.repeat(151) },
      { fullName: 42 },
      { phone: 'x'.repeat(31) },
      { phone: 42 },
    ]) {
      const response = await updateMeRequest(badBody, patient.accessToken);
      assert.equal(response.status, 400, `expected 400 for body ${JSON.stringify(badBody)}`);
      assert.equal(response.body.status, 'validation_error');
      assert.ok(Array.isArray(response.body.errors));
    }
  });

  it('ignores unknown fields instead of persisting them', async () => {
    const patient = await createPatientAccount({ fullName: 'Escalation Target' });

    const response = await updateMeRequest(
      { fullName: 'Escalated?', role: 'ADMIN', is_active: false },
      patient.accessToken
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.data.role, 'PATIENT', 'role escalation attempt must have no effect');

    const userRow = await prisma.user.findUnique({ where: { id: patient.userId } });
    assert.equal(userRow.role, 'PATIENT');
    assert.equal(userRow.is_active, true, 'is_active tampering must have no effect');
  });

  it('rejects anonymous requests with 401', async () => {
    const response = await request(app).patch(`${BASE}/patients/me`).send({ fullName: 'Anon' });
    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'unauthorized');
  });

  it('rejects DOCTOR and ADMIN roles with 403', async () => {
    const spec = await createSpecialty(`Patient Guard ${randomUUID()}`);
    const doctor = await createDoctorAccount(spec.id, 'Dr. Not A Patient');
    const doctorAttempt = await updateMeRequest({ fullName: 'Doctor Name' }, doctor.accessToken);
    assert.equal(doctorAttempt.status, 403);
    assert.equal(doctorAttempt.body.status, 'forbidden');

    const adminAttempt = await updateMeRequest({ fullName: 'Admin Name' }, admin.accessToken);
    assert.equal(adminAttempt.status, 403);
    assert.equal(adminAttempt.body.status, 'forbidden');
  });
});

describe('patient profile ownership', () => {
  it('a patient updating /me never touches another patient\'s profile', async () => {
    const owner = await createPatientAccount({ fullName: 'Owner Before' });
    const bystander = await createPatientAccount({ fullName: 'Bystander' });
    const ownerDob = '1992-03-03';

    const response = await updateMeRequest(
      { fullName: 'Owner After', phone: '+201222222222', dateOfBirth: ownerDob },
      owner.accessToken
    );
    assert.equal(response.status, 200);

    const ownerUser = await prisma.user.findUnique({ where: { id: owner.userId } });
    assert.equal(ownerUser.full_name, 'Owner After', "the caller's own profile is updated");

    const bystanderUser = await prisma.user.findUnique({ where: { id: bystander.userId } });
    assert.equal(bystanderUser.full_name, 'Bystander', 'the other account must stay untouched');
    assert.equal(bystanderUser.phone, null);

    const bystanderPatient = await patientRowFor(bystander.userId);
    assert.equal(bystanderPatient.date_of_birth, null);
  });

  it('a client-supplied patient id cannot redirect the update (no such route)', async () => {
    const owner = await createPatientAccount({ fullName: 'Forger' });
    const target = await createPatientAccount({ fullName: 'Target' });
    const targetRow = await patientRowFor(target.userId);

    const forged = await request(app)
      .patch(`${BASE}/patients/${targetRow.id}`)
      .send({ fullName: 'Hijacked' })
      .auth(owner.accessToken, { type: 'bearer' });

    assert.equal(forged.status, 404, 'PATCH /patients/:id is not an owned-update route');

    const targetUser = await prisma.user.findUnique({ where: { id: target.userId } });
    assert.equal(targetUser.full_name, 'Target', 'targeted profile must remain unchanged');
  });
});

describe('missing patient profile integrity', () => {
  it('returns 404 when a PATIENT account has no Patient row', async () => {
    const patient = await createPatientAccount({ fullName: 'Ghost Patient' });
    await prisma.patient.delete({ where: { user_id: patient.userId } });

    const updateAttempt = await updateMeRequest({ fullName: 'No Profile' }, patient.accessToken);
    assert.equal(updateAttempt.status, 404);
    assert.equal(updateAttempt.body.status, 'not_found');
    assert.equal(updateAttempt.body.message, 'Patient not found');
  });
});

describe('GET /api/v1/users/me', () => {
  it('rejects anonymous requests with 401', async () => {
    const response = await request(app).get(`${BASE}/users/me`);
    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'unauthorized');
  });

  it('returns a PATIENT together with their patient profile', async () => {
    const patient = await createPatientAccount({ fullName: 'Me Patient', phone: '+201333333333' });
    await updateMeRequest({ dateOfBirth: '1997-11-23' }, patient.accessToken);
    const patientRow = await patientRowFor(patient.userId);

    const response = await getMeRequest(patient.accessToken);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.deepEqual(Object.keys(response.body).sort(), ['data', 'status']);

    const data = response.body.data;
    assert.deepEqual(Object.keys(data).sort(), [
      'createdAt',
      'email',
      'fullName',
      'id',
      'isActive',
      'patient',
      'phone',
      'role',
      'updatedAt',
    ]);
    assert.equal(data.id, patient.userId);
    assert.equal(data.email, patient.email, 'the account owner sees their own email');
    assert.equal(data.fullName, 'Me Patient');
    assert.equal(data.phone, '+201333333333');
    assert.equal(data.role, 'PATIENT');
    assert.equal(data.isActive, true);
    assert.deepEqual(data.patient, { id: patientRow.id, dateOfBirth: '1997-11-23' });
  });

  it('returns a DOCTOR together with their doctor profile including the specialty', async () => {
    const spec = await createSpecialty(`Users Me ${randomUUID()}`);
    const doctor = await createDoctorAccount(spec.id, 'Dr. Me');
    await prisma.doctor.update({
      where: { user_id: doctor.userId },
      data: { bio: 'Profile probe bio' },
    });
    const doctorRow = await prisma.doctor.findUnique({ where: { user_id: doctor.userId } });

    const response = await getMeRequest(doctor.accessToken);

    assert.equal(response.status, 200);
    const data = response.body.data;
    assert.deepEqual(Object.keys(data).sort(), [
      'createdAt',
      'doctor',
      'email',
      'fullName',
      'id',
      'isActive',
      'phone',
      'role',
      'updatedAt',
    ]);
    assert.equal(data.id, doctor.userId);
    assert.equal(data.fullName, 'Dr. Me');
    assert.deepEqual(data.doctor, {
      id: doctorRow.id,
      specialty: { id: spec.id, name: spec.name },
      bio: 'Profile probe bio',
    });
  });

  it('returns ADMIN account data without any doctor/patient profile', async () => {
    const response = await getMeRequest(admin.accessToken);

    assert.equal(response.status, 200);
    const data = response.body.data;
    assert.deepEqual(Object.keys(data).sort(), [
      'createdAt',
      'email',
      'fullName',
      'id',
      'isActive',
      'phone',
      'role',
      'updatedAt',
    ]);
    assert.equal(data.role, 'ADMIN');
  });

  it('never exposes sensitive account or auth state', async () => {
    const patient = await createPatientAccount();

    const response = await getMeRequest(patient.accessToken);

    const serialized = JSON.stringify(response.body);
    for (const secret of [
      'password_hash',
      'failed_login_count',
      'locked_until',
      '"is_active"',
      '"full_name"',
      '"date_of_birth"',
      'accessToken',
      'refreshToken',
    ]) {
      assert.ok(!serialized.includes(secret), `/users/me must not expose ${secret}`);
    }
  });

  it('returns 404 when an authenticated DOCTOR has no Doctor row', async () => {
    const spec = await createSpecialty(`Ghost Doctor ${randomUUID()}`);
    const doctor = await createDoctorAccount(spec.id, 'Dr. Ghost Me');
    await prisma.doctor.delete({ where: { user_id: doctor.userId } });

    const response = await getMeRequest(doctor.accessToken);
    assert.equal(response.status, 404);
    assert.equal(response.body.status, 'not_found');
    assert.equal(response.body.message, 'Doctor not found');
  });

  it('matches docs/API.md: PATCH then GET agree on the same merged shape', async () => {
    const patient = await createPatientAccount({ fullName: 'Contract Check' });

    const patched = await updateMeRequest(
      { phone: '+201444444444', dateOfBirth: '1965-07-01' },
      patient.accessToken
    );
    const fetched = await getMeRequest(patient.accessToken);

    assert.equal(patched.status, 200);
    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.body.data, patched.body.data);
  });
});
