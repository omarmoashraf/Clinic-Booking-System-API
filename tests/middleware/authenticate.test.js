import assert from 'node:assert/strict';
import request from 'supertest';
import { after, before, describe, it } from 'node:test';
import app from '../../src/app.js';
import { setupTestDatabase, teardownTestDatabase, prisma } from '../helpers/db.js';
import {
  createAuthenticatedUser,
  generateExpiredAccessToken,
  logoutRequest,
  registerUser,
  uniqueEmail,
} from '../helpers/auth.js';
import { generateAccessToken } from '../../src/utils/jwt.js';

before(setupTestDatabase);
after(teardownTestDatabase);

/**
 * The auth middleware is exercised through the real protected route
 * POST /api/v1/auth/logout - no test-only routes are mounted.
 * Middleware failures return 401 before the route logic runs.
 */
describe('authenticate middleware', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const response = await request(app).post('/api/v1/auth/logout').send({ refreshToken: 'x' });

    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'unauthorized');
    assert.equal(response.body.message, 'Authentication required');
  });

  it('returns 401 for a malformed Bearer header', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Token abc.def.ghi')
      .send({ refreshToken: 'x' });

    assert.equal(response.status, 401);
    assert.equal(response.body.message, 'Authentication required');
  });

  it('returns 401 for a syntactically invalid JWT', async () => {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .auth('not-a-real-jwt', { type: 'bearer' })
      .send({ refreshToken: 'x' });

    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'unauthorized');
    assert.equal(response.body.message, 'Invalid token');
  });

  it('returns 401 for an expired access token', async () => {
    const user = await createAuthenticatedUser();
    const expired = generateExpiredAccessToken({ id: user.userId, role: user.role });

    const response = await logoutRequest(expired, user.refreshToken);

    assert.equal(response.status, 401);
    assert.equal(response.body.message, 'Invalid token');
  });

  it('returns 401 when the token belongs to a deactivated user', async () => {
    const { response: registration } = await registerUser({
      email: uniqueEmail('deactivated'),
      fullName: 'Deactivated User',
    });
    const userId = registration.body.data.id;

    // Deactivate first; the middleware must reject even a valid signature.
    await prisma.user.update({ where: { id: userId }, data: { is_active: false } });

    const token = generateAccessToken({ id: userId, role: 'PATIENT' });

    const response = await logoutRequest(token, 'any-refresh-token');

    assert.equal(response.status, 401);
    assert.equal(response.body.message, 'Invalid token');
  });

  it('lets a valid access token proceed to the route handler', async () => {
    const user = await createAuthenticatedUser();

    const response = await logoutRequest(user.accessToken, user.refreshToken);

    // Reaching the controller proves the middleware passed: logout revokes
    // the family and responds 204 No Content.
    assert.equal(response.status, 204);
  });
});
