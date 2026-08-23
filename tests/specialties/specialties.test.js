/**
 * Milestone 9 — Specialties integration tests.
 *
 * Follows the M8 conventions: real app + real PostgreSQL via
 * setupTestDatabase/teardownTestDatabase, supertest requests, direct
 * Prisma assertions for persistence, serial file execution.
 *
 * List/search assertions are scoped with a unique lowercase letter-only
 * marker embedded in each seeded name. Because specialty names are globally
 * unique and the markers never contain words like "card", a search term of
 * "<marker> <word>" can only ever match this block's own rows — no matter
 * what any other test in this file (or re-run) has created. That makes
 * meta.total / meta.totalPages assertions exact instead of relative.
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

const BASE = '/api/v1/specialties';

const listRequest = (query) => request(app).get(BASE).query(query ?? {});
const getByIdRequest = (id) => request(app).get(`${BASE}/${id}`);
const createRequest = (body, token) =>
  request(app).post(BASE).send(body).auth(token ?? '', { type: 'bearer' });
const updateRequest = (id, body, token) =>
  request(app).patch(`${BASE}/${id}`).send(body).auth(token ?? '', { type: 'bearer' });
const deleteRequest = (id, token) =>
  request(app).delete(`${BASE}/${id}`).auth(token ?? '', { type: 'bearer' });

/**
 * Unique lowercase LETTERS-only marker (hex digits would trip the POST
 * charset validator, which allows letters/spaces/hyphens/ampersands only).
 * Safe to embed in specialty names and search terms alike.
 */
const HEX_TO_LETTER = 'abcdefghijklmnop';
const uid = () =>
  [...randomUUID().replace(/-/g, '')]
    .slice(0, 12)
    .map((c) => HEX_TO_LETTER[parseInt(c, 16)])
    .join('');

let admin;

before(async () => {
  await setupTestDatabase();
  admin = await createAdmin();
});

after(teardownTestDatabase);

describe('GET /api/v1/specialties', () => {
  // Deterministic seed sets, one per concern, all scoped by their marker.
  const ord = uid();
  const page = uid();
  const lim = uid();
  const card = uid();

  before(async () => {
    // Ordering set: seeded out of alphabetical order on purpose.
    const orderingNames = ['Delta', 'Alpha', 'Gamma', 'Beta'];
    await prisma.specialty.createMany({
      data: orderingNames.map((n) => ({ name: `${ord} Ordering ${n}` })),
    });

    // Pagination set: exactly 5 rows.
    const pageNames = ['One', 'Two', 'Three', 'Four', 'Five'];
    await prisma.specialty.createMany({
      data: pageNames.map((n) => ({ name: `${page} PageProbe ${n}` })),
    });

    // Default-limit set: 11 rows so default limit=10 must truncate page 1.
    const limitNames = Array.from({ length: 11 }, (_, i) =>
      String(i + 1).padStart(2, '0')
    );
    await prisma.specialty.createMany({
      data: limitNames.map((n) => ({ name: `${lim} LimitProbe Row ${n}` })),
    });

    // Search set: two "card" matches + one non-match.
    await prisma.specialty.createMany({
      data: [
        { name: `${card} Cardiology Probe` },
        { name: `${card} Cardiac Surgery Probe` },
        { name: `${card} Dermatology Probe` },
      ],
    });
  });

  it('allows anonymous access and returns the documented envelope', async () => {
    const response = await listRequest();

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.ok(Array.isArray(response.body.data));
    assert.ok(response.body.meta);
    assert.deepEqual(
      Object.keys(response.body.meta).sort(),
      ['limit', 'page', 'total', 'totalPages']
    );

    const row = response.body.data[0];
    assert.deepEqual(Object.keys(row).sort(), ['created_at', 'id', 'name']);
  });

  it('applies default pagination (page=1, limit=10)', async () => {
    const response = await listRequest({ search: `${lim} LimitProbe` });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 10, 'default limit must be 10');
    assert.equal(response.body.meta.page, 1);
    assert.equal(response.body.meta.limit, 10);
    assert.equal(response.body.meta.total, 11);
    assert.equal(response.body.meta.totalPages, 2);
  });

  it('returns the requested explicit page slice', async () => {
    const response = await listRequest({
      search: `${page} PageProbe`,
      page: 2,
      limit: 2,
    });

    assert.equal(response.status, 200);
    // Alphabetical order of {Five, Four, One, Three, Two} → page 2 = [One, Three].
    assert.deepEqual(
      response.body.data.map((s) => s.name),
      [`${page} PageProbe One`, `${page} PageProbe Three`]
    );
    assert.equal(response.body.meta.page, 2);
    assert.equal(response.body.meta.limit, 2);
    assert.equal(response.body.meta.total, 5);
    assert.equal(response.body.meta.totalPages, 3);
  });

  it('orders results by name ascending deterministically', async () => {
    const response = await listRequest({ search: `${ord} Ordering`, limit: 100 });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.data.map((s) => s.name),
      [
        `${ord} Ordering Alpha`,
        `${ord} Ordering Beta`,
        `${ord} Ordering Delta`,
        `${ord} Ordering Gamma`,
      ]
    );
  });

  it('searches case-insensitively with contains semantics', async () => {
    // Uppercase query against mixed-case stored names. "CARD" (unlike
    // "CARDIO") is a genuine substring of both Cardiac and Cardiology.
    const response = await listRequest({ search: `${card.toUpperCase()} CARD` });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.data.map((s) => s.name).sort(),
      [`${card} Cardiac Surgery Probe`, `${card} Cardiology Probe`].sort()
    );
  });

  it('matches substrings inside the name, not just prefixes of words', async () => {
    // "diolog" sits inside "Cardiology" but starts mid-word.
    // "cardio" occurs only inside "Cardiology" — "Cardiac" does not
    // contain it — so exactly one row must match.
    const response = await listRequest({ search: `${card} cardio` });
    assert.equal(response.body.meta.total, 1);

    const inner = await listRequest({ search: 'diolog' });
    assert.equal(inner.status, 200);
    assert.ok(
      inner.body.data.some((s) => s.name === `${card} Cardiology Probe`),
      'contains search must match inside a word'
    );
  });

  it('search filters rows, total, and totalPages together', async () => {
    const filtered = await listRequest({ search: `${card} card`, limit: 1 });

    assert.equal(filtered.body.data.length, 1);
    assert.equal(filtered.body.meta.total, 2, 'only the two card* probes match');
    assert.equal(filtered.body.meta.totalPages, 2, 'totalPages derives from filtered total');

    // The non-matching probe must not leak into results or totals.
    assert.ok(!JSON.stringify(filtered.body).includes('Dermatology'));
    const unfiltered = await listRequest({ search: `${card}` , limit: 100 });
    assert.equal(unfiltered.body.meta.total, 3);
  });
});

describe('GET /api/v1/specialties/:id', () => {
  it('returns an existing specialty anonymously with the documented shape', async () => {
    const specialty = await createSpecialty(`GetById ${uid()}`);
    const response = await getByIdRequest(specialty.id);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.deepEqual(Object.keys(response.body).sort(), ['data', 'status']);
    assert.deepEqual(Object.keys(response.body.data).sort(), ['created_at', 'id', 'name']);
    assert.equal(response.body.data.id, specialty.id);
    assert.equal(response.body.data.name, specialty.name);
  });

  it('returns 404 for an unknown UUID', async () => {
    const response = await getByIdRequest(randomUUID());
    assert.equal(response.status, 404);
    assert.equal(response.body.status, 'not_found');
  });

  it('returns 400 for a malformed UUID', async () => {
    const response = await getByIdRequest('not-a-uuid');
    assert.equal(response.status, 400);
    assert.equal(response.body.status, 'validation_error');
    assert.ok(response.body.errors.some((issue) => issue.field.includes('id')));
  });
});

describe('POST /api/v1/specialties', () => {
  it('creates a specialty as ADMIN, returns 201, and persists it', async () => {
    const name = `${uid()} Created Specialty`;
    const response = await createRequest({ name }, admin.accessToken);

    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.data.name, name);

    const row = await prisma.specialty.findUnique({ where: { id: response.body.data.id } });
    assert.ok(row, 'specialty should be persisted');
    assert.equal(row.name, name);
  });

  it('rejects a duplicate name with 409 and the contract message', async () => {
    const name = `${uid()} Duplicate Specialty`;
    const first = await createRequest({ name }, admin.accessToken);
    assert.equal(first.status, 201);

    const second = await createRequest({ name }, admin.accessToken);
    assert.equal(second.status, 409);
    assert.equal(second.body.status, 'conflict');
    assert.equal(second.body.message, 'Specialty with this name already exists');

    const count = await prisma.specialty.count({ where: { name } });
    assert.equal(count, 1);
  });

  it('rejects invalid bodies with 400', async () => {
    for (const badBody of [{ name: 'C' }, { name: 'Cardio123!' }, {}]) {
      const response = await createRequest(badBody, admin.accessToken);
      assert.equal(response.status, 400, `expected 400 for body ${JSON.stringify(badBody)}`);
      assert.equal(response.body.status, 'validation_error');
      assert.ok(Array.isArray(response.body.errors));
    }
  });

  it('rejects anonymous requests with 401', async () => {
    const response = await request(app).post(BASE).send({ name: 'No Auth Specialty' });
    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'unauthorized');
  });

  it('rejects PATIENT and DOCTOR roles with 403', async () => {
    const fixture = await createSpecialty(`DoctorRoleFixture ${uid()}`);
    const patient = await createAuthenticatedUser({ role: 'PATIENT' });
    const doctor = await createAuthenticatedUser({
      role: 'DOCTOR',
      specialtyId: fixture.id,
    });

    for (const user of [patient, doctor]) {
      const response = await createRequest({ name: `Forbidden ${uid()}` }, user.accessToken);
      assert.equal(response.status, 403);
      assert.equal(response.body.status, 'forbidden');
    }
  });
});

describe('PATCH /api/v1/specialties/:id', () => {
  it('renames a specialty as ADMIN and persists the new value', async () => {
    const specialty = await createSpecialty(`Patch Old ${uid()}`);
    const newName = `Patch New ${uid()}`;

    const response = await updateRequest(
      specialty.id,
      { name: newName },
      admin.accessToken
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.data.id, specialty.id);
    assert.equal(response.body.data.name, newName);

    const row = await prisma.specialty.findUnique({ where: { id: specialty.id } });
    assert.equal(row.name, newName, 'rename must persist');
  });

  it('allows updating a specialty to its current name (self-rename)', async () => {
    const specialty = await createSpecialty(`SelfRename ${uid()}`);

    const response = await updateRequest(
      specialty.id,
      { name: specialty.name },
      admin.accessToken
    );

    assert.equal(response.status, 200, 'renaming to its own name must not conflict');
    assert.equal(response.body.data.name, specialty.name);
  });

  it('rejects renaming to another specialty\'s existing name with 409', async () => {
    const first = await createSpecialty(`Conflict A ${uid()}`);
    const second = await createSpecialty(`Conflict B ${uid()}`);

    const response = await updateRequest(
      second.id,
      { name: first.name },
      admin.accessToken
    );

    assert.equal(response.status, 409);
    assert.equal(response.body.status, 'conflict');
    assert.equal(response.body.message, 'Specialty with this name already exists');

    // Both rows survive unchanged.
    const rows = await prisma.specialty.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    assert.deepEqual(rows.map((r) => r.name).sort(), [first.name, second.name]);
  });

  it('returns 404 when the specialty does not exist', async () => {
    const response = await updateRequest(
      randomUUID(),
      { name: `Ghost ${uid()}` },
      admin.accessToken
    );
    assert.equal(response.status, 404);
    assert.equal(response.body.status, 'not_found');
  });

  it('rejects invalid bodies with 400, including missing name (name is required)', async () => {
    const specialty = await createSpecialty(`PatchValidation ${uid()}`);

    const missingName = await updateRequest(specialty.id, {}, admin.accessToken);
    assert.equal(missingName.status, 400, 'contract: PATCH requires name');
    assert.equal(missingName.body.status, 'validation_error');

    const badChars = await updateRequest(specialty.id, { name: 'X' }, admin.accessToken);
    assert.equal(badChars.status, 400);
  });

  it('rejects anonymous requests with 401', async () => {
    const specialty = await createSpecialty(`PatchAnon ${uid()}`);
    const response = await request(app)
      .patch(`${BASE}/${specialty.id}`)
      .send({ name: 'Whatever' });
    assert.equal(response.status, 401);
  });

  it('rejects PATIENT and DOCTOR roles with 403', async () => {
    const fixture = await createSpecialty(`PatchRoles Fixture ${uid()}`);
    const target = await createSpecialty(`PatchRoles Target ${uid()}`);
    const patient = await createAuthenticatedUser({ role: 'PATIENT' });
    const doctor = await createAuthenticatedUser({
      role: 'DOCTOR',
      specialtyId: fixture.id,
    });

    for (const user of [patient, doctor]) {
      const response = await updateRequest(
        target.id,
        { name: `Forbidden Rename ${uid()}` },
        user.accessToken
      );
      assert.equal(response.status, 403);
      assert.equal(response.body.status, 'forbidden');
    }
  });
});

describe('DELETE /api/v1/specialties/:id', () => {
  it('deletes as ADMIN, returns 204 with no body, and removes the row', async () => {
    const specialty = await createSpecialty(`Delete Me ${uid()}`);

    const response = await deleteRequest(specialty.id, admin.accessToken);

    assert.equal(response.status, 204);
    assert.equal(response.text, '', '204 must carry no response body');

    const row = await prisma.specialty.findUnique({ where: { id: specialty.id } });
    assert.equal(row, null, 'specialty should be gone from the database');
  });

  it('returns 404 when deleting a missing specialty', async () => {
    const response = await deleteRequest(randomUUID(), admin.accessToken);
    assert.equal(response.status, 404);
    assert.equal(response.body.status, 'not_found');
  });

  it('returns 409 when a doctor is still assigned to the specialty', async () => {
    // Registering a DOCTOR through the API creates the Doctor row that
    // holds the FK — exactly the production path.
    const specialty = await createSpecialty(`In Use ${uid()}`);
    const registration = await registerRequest({
      email: uniqueEmail('doctor'),
      password: TEST_PASSWORD,
      fullName: 'Dr. In Use',
      role: 'DOCTOR',
      specialtyId: specialty.id,
    });
    assert.equal(registration.status, 201);

    const response = await deleteRequest(specialty.id, admin.accessToken);
    assert.equal(response.status, 409);
    assert.equal(response.body.status, 'conflict');
    assert.equal(response.body.message, 'Specialty is still assigned to doctors');

    const row = await prisma.specialty.findUnique({ where: { id: specialty.id } });
    assert.ok(row, 'in-use specialty must not be deleted');
  });

  it('rejects anonymous requests with 401', async () => {
    const specialty = await createSpecialty(`Delete Anon ${uid()}`);
    const response = await request(app).delete(`${BASE}/${specialty.id}`);
    assert.equal(response.status, 401);
  });

  it('rejects PATIENT and DOCTOR roles with 403', async () => {
    const fixture = await createSpecialty(`DeleteRoles Fixture ${uid()}`);
    const target = await createSpecialty(`DeleteRoles Target ${uid()}`);
    const patient = await createAuthenticatedUser({ role: 'PATIENT' });
    const doctor = await createAuthenticatedUser({
      role: 'DOCTOR',
      specialtyId: fixture.id,
    });

    for (const user of [patient, doctor]) {
      const response = await deleteRequest(target.id, user.accessToken);
      assert.equal(response.status, 403);
      assert.equal(response.body.status, 'forbidden');

      const row = await prisma.specialty.findUnique({ where: { id: target.id } });
      assert.ok(row, 'target must survive forbidden deletes');
    }
  });
});

describe('concurrent duplicate creation', () => {
  it('resolves two same-name creates to exactly one 201 and one 409', async () => {
    // Two DIFFERENT admins race — proves the backstop is the database
    // unique constraint, not any shared in-process state.
    const secondAdmin = await createAdmin();
    const name = `Race ${uid()}`;

    const [first, second] = await Promise.all([
      createRequest({ name }, admin.accessToken),
      createRequest({ name }, secondAdmin.accessToken),
    ]);

    assert.deepEqual(
      [first.status, second.status].sort(),
      [201, 409],
      'exactly one concurrent create may succeed'
    );
    assert.equal(first.body.status === 'success' ? first.status : second.status, 201);

    const count = await prisma.specialty.count({ where: { name } });
    assert.equal(count, 1, 'the unique constraint must yield a single row');
  });
});
