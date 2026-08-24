/**
 * Milestone 10 — Doctors module integration tests.
 *
 * Follows the M8/M9 conventions: real app + real PostgreSQL via
 * setupTestDatabase/teardownTestDatabase, supertest requests, direct
 * Prisma assertions for persistence, serial file execution.
 *
 * Doctor rows are seeded through the public registration API (the
 * production path that creates the User + Doctor pair), so every seeded
 * doctor exists exactly like a real account would. List/pagination
 * assertions are scoped with a dedicated per-concern specialty, which makes
 * meta.total / meta.totalPages exact instead of relative: only this block's
 * own doctors can ever carry the probe specialty.
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

const BASE = '/api/v1/doctors';

const listRequest = (query) => request(app).get(BASE).query(query ?? {});
const getByIdRequest = (id) => request(app).get(`${BASE}/${id}`);
const updateMeRequest = (body, token) =>
  request(app).patch(`${BASE}/me`).send(body).auth(token ?? '', { type: 'bearer' });

/** Register a DOCTOR through the API (creates User + Doctor) and return the user id. */
async function registerDoctor(fullName, specialtyId) {
  const response = await registerRequest({
    email: uniqueEmail('doctor'),
    password: TEST_PASSWORD,
    fullName,
    role: 'DOCTOR',
    specialtyId,
  });
  assert.equal(
    response.status,
    201,
    `test setup: doctor registration failed: ${JSON.stringify(response.body)}`
  );
  return response.body.data.id;
}

/** Convenience: a logged-in DOCTOR account on the given specialty. */
const createDoctorAccount = (specialtyId, fullName) =>
  createAuthenticatedUser({ role: 'DOCTOR', specialtyId, fullName });

/** The Doctor profile row belonging to a registered user id. */
const doctorRowFor = (userId) => prisma.doctor.findUnique({ where: { user_id: userId } });

/**
 * Unique lowercase LETTERS-only marker, same trick as the specialties suite,
 * so seeded names never collide across runs or blocks.
 */
const HEX_TO_LETTER = 'abcdefghijklmnop';
const uid = () =>
  [...randomUUID().replace(/-/g, '')]
    .slice(0, 12)
    .map((c) => HEX_TO_LETTER[parseInt(c, 16)])
    .join('');

let admin;
let sharedSpec;

before(async () => {
  await setupTestDatabase();
  admin = await createAdmin();
  // Specialty reused by detail/update/ownership blocks.
  sharedSpec = await createSpecialty(`Shared Fixture ${uid()}`);
});

after(teardownTestDatabase);

describe('GET /api/v1/doctors', () => {
  const pag = uid();
  const nf = uid();
  let pagSpec;
  let nfSpec;
  let otherSpec;

  before(async () => {
    pagSpec = await createSpecialty(`Pag Probe ${pag}`);
    nfSpec = await createSpecialty(`${nf} Dermatology`);
    otherSpec = await createSpecialty(`${nf} Unrelated`);

    // Pagination set: exactly 5 rows, alphabetical by name A–E.
    const pageNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
    for (const n of pageNames) {
      await registerDoctor(`${pag} Dr. ${n}`, pagSpec.id);
    }

    // Filter-by-name set: two matches in nfSpec, one excluded row in otherSpec.
    await registerDoctor(`${nf} Derm A`, nfSpec.id);
    await registerDoctor(`${nf} Derm B`, nfSpec.id);
    await registerDoctor(`${nf} Outsider`, otherSpec.id);
  });

  it('allows anonymous access and returns the documented envelope and shape', async () => {
    const response = await listRequest();

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.ok(Array.isArray(response.body.data));
    assert.ok(response.body.meta);
    assert.deepEqual(
      Object.keys(response.body.meta).sort(),
      ['limit', 'page', 'total', 'totalPages']
    );
    assert.ok(response.body.data.length >= 8, 'seeded doctors are visible anonymously');

    const row = response.body.data[0];
    assert.deepEqual(Object.keys(row).sort(), ['bio', 'fullName', 'id', 'specialty']);
    assert.deepEqual(Object.keys(row.specialty).sort(), ['id', 'name']);

    // No account/auth fields may leak through the public directory.
    const serialized = JSON.stringify(response.body);
    for (const secret of [
      'password_hash',
      '"email"',
      '"phone"',
      '"role"',
      'user_id',
      'is_active',
      'failed_login_count',
      'locked_until',
      'full_name',
    ]) {
      assert.ok(!serialized.includes(secret), `public listing must not expose ${secret}`);
    }
  });

  it('applies default pagination (page=1, limit=10)', async () => {
    const response = await listRequest({ specialty: pagSpec.name });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 5, 'all scoped rows fit under default limit');
    assert.equal(response.body.meta.page, 1);
    assert.equal(response.body.meta.limit, 10);
    assert.equal(response.body.meta.total, 5);
    assert.equal(response.body.meta.totalPages, 1);
  });

  it('returns the requested explicit page slice', async () => {
    const response = await listRequest({
      specialty: pagSpec.name,
      page: 2,
      limit: 2,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.data.map((d) => d.fullName),
      [`${pag} Dr. Charlie`, `${pag} Dr. Delta`]
    );
    assert.equal(response.body.meta.page, 2);
    assert.equal(response.body.meta.limit, 2);
    assert.equal(response.body.meta.total, 5);
    assert.equal(response.body.meta.totalPages, 3);
  });

  it('filters by specialty name case-insensitively', async () => {
    const response = await listRequest({ specialty: nfSpec.name.toUpperCase() });

    assert.equal(response.status, 200);
    assert.equal(response.body.meta.total, 2);
    assert.deepEqual(
      response.body.data.map((d) => d.fullName).sort(),
      [`${nf} Derm A`, `${nf} Derm B`]
    );

    // The unrelated specialty's doctor must not leak into another filter's result.
    assert.ok(!JSON.stringify(response.body).includes(`${nf} Outsider`));
  });

  it('filters by specialty id', async () => {
    const response = await listRequest({ specialty: pagSpec.id });

    assert.equal(response.status, 200);
    assert.equal(response.body.meta.total, 5);
    for (const doctor of response.body.data) {
      assert.equal(doctor.specialty.id, pagSpec.id);
    }
  });

  it('returns an empty page (not an error) for an unknown specialty', async () => {
    const response = await listRequest({ specialty: `${nf} Nonexistent Specialty` });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 0);
    assert.equal(response.body.meta.total, 0);
    assert.equal(response.body.meta.totalPages, 0);
  });

  it('rejects invalid pagination parameters with 400', async () => {
    for (const badQuery of [{ page: 0 }, { page: 'abc' }, { limit: 101 }, { limit: -1 }]) {
      const response = await listRequest(badQuery);
      assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(badQuery)}`);
      assert.equal(response.body.status, 'validation_error');
      assert.ok(Array.isArray(response.body.errors));
    }
  });
});

describe('GET /api/v1/doctors/:id', () => {
  it('returns an existing doctor anonymously with the documented shape', async () => {
    const fullName = `Dr. Detail ${uid()}`;
    const userId = await registerDoctor(fullName, sharedSpec.id);
    const row = await doctorRowFor(userId);

    const response = await getByIdRequest(row.id);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.deepEqual(Object.keys(response.body).sort(), ['data', 'status']);
    assert.deepEqual(Object.keys(response.body.data).sort(), ['bio', 'fullName', 'id', 'specialty']);
    assert.equal(response.body.data.id, row.id);
    assert.equal(response.body.data.fullName, fullName);
    assert.deepEqual(response.body.data.specialty, { id: sharedSpec.id, name: sharedSpec.name });
  });

  it('returns 404 for an unknown UUID', async () => {
    const response = await getByIdRequest(randomUUID());
    assert.equal(response.status, 404);
    assert.equal(response.body.status, 'not_found');
    assert.equal(response.body.message, 'Doctor not found');
  });

  it('returns 400 for a malformed UUID', async () => {
    const response = await getByIdRequest('not-a-uuid');
    assert.equal(response.status, 400);
    assert.equal(response.body.status, 'validation_error');
    assert.ok(response.body.errors.some((issue) => issue.field.includes('id')));
  });
});

describe('PATCH /api/v1/doctors/me', () => {
  it('lets a doctor update their own bio and persists it', async () => {
    const doctor = await createDoctorAccount(sharedSpec.id, `Dr. Bio ${uid()}`);
    const bio = `Board-certified probe ${uid()}`;

    const response = await updateMeRequest({ bio }, doctor.accessToken);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.deepEqual(Object.keys(response.body.data).sort(), ['bio', 'fullName', 'id', 'specialty']);
    assert.equal(response.body.data.bio, bio);

    const row = await prisma.doctor.findUnique({ where: { user_id: doctor.userId } });
    assert.equal(row.bio, bio, 'bio must persist');
  });

  it('switches the specialty via specialtyId and persists it', async () => {
    const doctor = await createDoctorAccount(sharedSpec.id, `Dr. Switch ${uid()}`);
    const target = await createSpecialty(`Switch Target ${uid()}`);

    const response = await updateMeRequest({ specialtyId: target.id }, doctor.accessToken);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.specialty, { id: target.id, name: target.name });

    const row = await prisma.doctor.findUnique({ where: { user_id: doctor.userId } });
    assert.equal(row.specialty_id, target.id, 'specialty switch must persist');
  });

  it('updates bio and specialtyId together in one request', async () => {
    const doctor = await createDoctorAccount(sharedSpec.id, `Dr. Both ${uid()}`);
    const target = await createSpecialty(`Both Target ${uid()}`);
    const bio = `Combined update ${uid()}`;

    const response = await updateMeRequest({ bio, specialtyId: target.id }, doctor.accessToken);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.bio, bio);
    assert.equal(response.body.data.specialty.id, target.id);

    const row = await prisma.doctor.findUnique({ where: { user_id: doctor.userId } });
    assert.equal(row.bio, bio);
    assert.equal(row.specialty_id, target.id);
  });

  it('treats an empty body as a valid no-op returning the current profile', async () => {
    const doctor = await createDoctorAccount(sharedSpec.id, `Dr. Noop ${uid()}`);
    const rowBefore = await doctorRowFor(doctor.userId);

    const response = await updateMeRequest({}, doctor.accessToken);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, rowBefore.id);
    assert.equal(response.body.data.specialty.id, sharedSpec.id);

    const rowAfter = await doctorRowFor(doctor.userId);
    assert.equal(rowAfter.updated_at.getTime(), rowBefore.updated_at.getTime(), 'no-op writes nothing');
  });

  it('returns 404 when specialtyId does not exist and leaves the profile unchanged', async () => {
    const doctor = await createDoctorAccount(sharedSpec.id, `Dr. Ghost ${uid()}`);
    const ghostId = randomUUID();

    const response = await updateMeRequest({ specialtyId: ghostId }, doctor.accessToken);

    assert.equal(response.status, 404);
    assert.equal(response.body.status, 'not_found');

    const row = await doctorRowFor(doctor.userId);
    assert.equal(row.specialty_id, sharedSpec.id, 'profile must be untouched after failed update');
  });

  it('rejects invalid bodies with 400', async () => {
    const doctor = await createDoctorAccount(sharedSpec.id, `Dr. Validation ${uid()}`);

    for (const badBody of [
      { specialtyId: 'not-a-uuid' },
      { specialtyId: 42 },
      { bio: '' },
      { bio: 42 },
      { bio: 'x'.repeat(1001) },
    ]) {
      const response = await updateMeRequest(badBody, doctor.accessToken);
      assert.equal(response.status, 400, `expected 400 for body ${JSON.stringify(badBody)}`);
      assert.equal(response.body.status, 'validation_error');
      assert.ok(Array.isArray(response.body.errors));
    }
  });

  it('ignores unknown fields instead of persisting them', async () => {
    const doctor = await createDoctorAccount(sharedSpec.id, `Dr. Unknown ${uid()}`);
    const bio = `Clean bio ${uid()}`;

    const response = await updateMeRequest({ bio, role: 'ADMIN', is_active: false }, doctor.accessToken);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.bio, bio);

    const userRow = await prisma.user.findUnique({ where: { id: doctor.userId } });
    assert.equal(userRow.role, 'DOCTOR', 'role escalation attempt must have no effect');
    assert.equal(userRow.is_active, true, 'is_active tampering must have no effect');
  });

  it('rejects anonymous requests with 401', async () => {
    const response = await request(app).patch(BASE + '/me').send({ bio: 'Anonymous bio' });
    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'unauthorized');
  });

  it('rejects PATIENT and ADMIN roles with 403', async () => {
    const patient = await createAuthenticatedUser();
    const patientBioAttempt = await updateMeRequest({ bio: 'Patient bio' }, patient.accessToken);
    assert.equal(patientBioAttempt.status, 403);
    assert.equal(patientBioAttempt.body.status, 'forbidden');

    const adminAttempt = await updateMeRequest({ bio: 'Admin bio' }, admin.accessToken);
    assert.equal(adminAttempt.status, 403);
    assert.equal(adminAttempt.body.status, 'forbidden');
  });
});

describe('doctor profile ownership', () => {
  it('a doctor updating /me never touches another doctor\'s profile', async () => {
    const drA = await createDoctorAccount(sharedSpec.id, `Dr. Owner ${uid()}`);
    const drB = await createDoctorAccount(sharedSpec.id, `Dr. Bystander ${uid()}`);
    const bioA = `Owner's bio ${uid()}`;

    const response = await updateMeRequest({ bio: bioA }, drA.accessToken);
    assert.equal(response.status, 200);

    const rowA = await doctorRowFor(drA.userId);
    const rowB = await doctorRowFor(drB.userId);
    assert.equal(rowA.bio, bioA, "the caller's own profile is updated");
    assert.equal(rowB.bio, null, 'the other doctor profile must stay untouched');
  });

  it('a client-supplied doctor id cannot redirect the update (no such route)', async () => {
    const drA = await createDoctorAccount(sharedSpec.id, `Dr. Forger ${uid()}`);
    const drB = await createDoctorAccount(sharedSpec.id, `Dr. Target ${uid()}`);
    const rowB = await doctorRowFor(drB.userId);

    const forged = await request(app)
      .patch(`${BASE}/${rowB.id}`)
      .send({ bio: `Hijack ${uid()}` })
      .auth(drA.accessToken, { type: 'bearer' });

    assert.equal(forged.status, 404, 'PATCH /doctors/:id is not an owned-update route');

    const rowAfter = await doctorRowFor(drB.userId);
    assert.equal(rowAfter.bio, null, 'targeted doctor profile must remain unchanged');
  });
});
