import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { setupTestDatabase, teardownTestDatabase, prisma } from '../helpers/db.js';
import { TEST_PASSWORD, createSpecialty, registerRequest, uniqueEmail } from '../helpers/auth.js';

before(setupTestDatabase);
after(teardownTestDatabase);

describe('POST /api/v1/auth/register', () => {
  it('registers a patient and persists the user + patient profile', async () => {
    const email = uniqueEmail('patient');
    const response = await registerRequest({
      email,
      password: TEST_PASSWORD,
      fullName: 'Jane Doe',
      phone: '+201000000000',
      role: 'PATIENT',
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.data.role, 'PATIENT');

    // Response contract: exactly id + role - no credentials, no tokens.
    assert.deepEqual(Object.keys(response.body.data).sort(), ['id', 'role']);
    assert.ok(!JSON.stringify(response.body).includes(TEST_PASSWORD));
    assert.ok(!JSON.stringify(response.body).includes('accessToken'));
    assert.ok(!JSON.stringify(response.body).includes('password_hash'));

    const userId = response.body.data.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    assert.ok(user, 'user row should be persisted');
    assert.equal(user.email, email.toLowerCase());
    assert.notEqual(user.password_hash, TEST_PASSWORD, 'plain password must not be stored');
    assert.equal(user.is_active, true);
    assert.equal(user.failed_login_count, 0);

    const patient = await prisma.patient.findUnique({ where: { user_id: userId } });
    assert.ok(patient, 'patient profile row should be persisted');
  });

  it('registers a doctor with a valid specialtyId and links the specialty', async () => {
    const specialty = await createSpecialty('Cardiology');
    const email = uniqueEmail('doctor');
    const response = await registerRequest({
      email,
      password: TEST_PASSWORD,
      fullName: 'Dr. John Smith',
      role: 'DOCTOR',
      specialtyId: specialty.id,
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.data.role, 'DOCTOR');

    const doctor = await prisma.doctor.findUnique({
      where: { user_id: response.body.data.id },
      include: { specialty: true },
    });
    assert.ok(doctor, 'doctor profile row should be persisted');
    assert.equal(doctor.specialty_id, specialty.id);
    assert.equal(doctor.specialty.name, specialty.name);

    // A doctor must not get a patient profile.
    const patient = await prisma.patient.findUnique({ where: { user_id: response.body.data.id } });
    assert.equal(patient, null);
  });

  it('rejects a duplicate email with 409 and creates no second user', async () => {
    const email = uniqueEmail('duplicate');

    const first = await registerRequest({
      email,
      password: TEST_PASSWORD,
      fullName: 'First User',
      role: 'PATIENT',
    });
    assert.equal(first.status, 201);

    const second = await registerRequest({
      email,
      password: TEST_PASSWORD,
      fullName: 'Second User',
      role: 'PATIENT',
    });

    assert.equal(second.status, 409);
    assert.equal(second.body.status, 'conflict');
    assert.equal(second.body.message, 'Email already exist');

    const usersWithEmail = await prisma.user.count({ where: { email } });
    assert.equal(usersWithEmail, 1);
  });

  it('rejects doctor registration without specialtyId with 400 and creates no user', async () => {
    const email = uniqueEmail('nospecialty');
    const response = await registerRequest({
      email,
      password: TEST_PASSWORD,
      fullName: 'Dr. No Specialty',
      role: 'DOCTOR',
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.status, 'validation_error');
    assert.ok(
      response.body.errors.some((issue) => issue.field.includes('specialtyId')),
      'validation errors should mention specialtyId'
    );

    const usersWithEmail = await prisma.user.count({ where: { email } });
    assert.equal(usersWithEmail, 0, 'no user row should be created');
  });

  it('returns 404 when specialtyId is a valid UUID but unknown specialty', async () => {
    const email = uniqueEmail('unknownspecialty');
    const response = await registerRequest({
      email,
      password: TEST_PASSWORD,
      fullName: 'Dr. Ghost Specialty',
      role: 'DOCTOR',
      specialtyId: randomUUID(),
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.status, 'not_found');
    assert.equal(response.body.message, 'Specialty not found');

    const usersWithEmail = await prisma.user.count({ where: { email } });
    assert.equal(usersWithEmail, 0);
  });
});
