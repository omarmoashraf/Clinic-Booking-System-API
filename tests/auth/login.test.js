import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { setupTestDatabase, teardownTestDatabase, prisma } from '../helpers/db.js';
import {
  TEST_PASSWORD,
  loginRequest,
  registerUser,
  uniqueEmail,
} from '../helpers/auth.js';

before(setupTestDatabase);
after(teardownTestDatabase);

const INVALID_LOGIN_MESSAGE = 'Invalid email or password';

describe('POST /api/v1/auth/login', () => {
  it('logs in with valid credentials and issues a working token pair', async () => {
    const email = uniqueEmail('login');
    await registerUser({ email });

    const response = await loginRequest(email, TEST_PASSWORD);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');

    const data = response.body.data;
    // Response contract: accessToken + refreshToken + user.
    assert.deepEqual(Object.keys(data).sort(), ['accessToken', 'refreshToken', 'user']);
    assert.equal(typeof data.accessToken, 'string');
    assert.match(data.refreshToken, /^[0-9a-f]{96}$/, 'refresh token is a 96-char hex string');
    assert.deepEqual(Object.keys(data.user).sort(), ['id', 'role']);

    // A refresh token row was persisted for this user.
    const storedTokens = await prisma.refreshToken.findMany({
      where: { user_id: data.user.id },
    });
    assert.equal(storedTokens.length, 1);
    assert.equal(storedTokens[0].revoked_at, null);
  });

  it('rejects a wrong password with the generic 401 message', async () => {
    const { body } = await registerUser();
    const response = await loginRequest(body.email, 'WrongPassword123');

    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'unauthorized');
    assert.equal(response.body.message, INVALID_LOGIN_MESSAGE);

    // The failed attempt is recorded for the lockout policy.
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    assert.equal(user.failed_login_count, 1);
  });

  it('rejects an unknown email with the identical generic 401', async () => {
    const response = await loginRequest(uniqueEmail('ghost'), TEST_PASSWORD);

    assert.equal(response.status, 401);
    assert.equal(response.body.message, INVALID_LOGIN_MESSAGE);
  });

  it('rejects a deactivated account with the identical generic 401', async () => {
    const { body } = await registerUser();

    await prisma.user.update({ where: { email: body.email }, data: { is_active: false } });

    const response = await loginRequest(body.email, body.password);

    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'unauthorized');
    assert.equal(response.body.message, INVALID_LOGIN_MESSAGE);
  });
});
