import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { setupTestDatabase, teardownTestDatabase, prisma } from '../helpers/db.js';
import { TEST_PASSWORD, loginRequest, registerUser } from '../helpers/auth.js';

before(setupTestDatabase);
after(teardownTestDatabase);

const INVALID_LOGIN_MESSAGE = 'Invalid email or password';
// Must match MAX_FAILED_LOGIN_ATTEMPTS in src/services/auth.service.js.
const MAX_FAILED_LOGIN_ATTEMPTS = 5;

describe('login lockout', () => {
  it('locks the account after 5 failed attempts and rejects the correct password while locked', async () => {
    const { body } = await registerUser();

    for (let attempt = 1; attempt <= MAX_FAILED_LOGIN_ATTEMPTS; attempt++) {
      const response = await loginRequest(body.email, 'NotThePassword');
      assert.equal(response.status, 401);
    }

    // The threshold was reached: a lockout is set (counter resets with it).
    let user = await prisma.user.findUnique({ where: { email: body.email } });
    assert.ok(user.locked_until, 'locked_until should be set after 5 failures');
    assert.ok(user.locked_until.getTime() > Date.now(), 'lock should be in the future');
    assert.equal(user.failed_login_count, 0);

    // Even the correct password is rejected while locked.
    const lockedResponse = await loginRequest(body.email, body.password);
    assert.equal(lockedResponse.status, 401);
    assert.equal(lockedResponse.body.message, INVALID_LOGIN_MESSAGE);

    // Locked accounts are not further penalized: no extra failed-attempt rows.
    user = await prisma.user.findUnique({ where: { email: body.email } });
    assert.equal(user.failed_login_count, 0);
  });

  it('allows authentication again once the lockout duration has passed', async () => {
    const { body } = await registerUser();
    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i++) {
      await loginRequest(body.email, 'NotThePassword');
    }

    // Simulate the passage of time instead of waiting out the real
    // 15-minute lockout: move locked_until into the past.
    await prisma.user.update({
      where: { email: body.email },
      data: { locked_until: new Date(Date.now() - 1000) },
    });

    const response = await loginRequest(body.email, body.password);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.user.role, 'PATIENT');

    // A successful login clears the lockout state completely.
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    assert.equal(user.locked_until, null);
    assert.equal(user.failed_login_count, 0);
  });
});
