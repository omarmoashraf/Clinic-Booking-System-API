import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { setupTestDatabase, teardownTestDatabase, prisma } from '../helpers/db.js';
import {
  createAuthenticatedUser,
  logoutRequest,
  refreshRequest,
  sha256,
} from '../helpers/auth.js';

before(setupTestDatabase);
after(teardownTestDatabase);

describe('POST /api/v1/auth/logout', () => {
  it('revokes the presented refresh token and returns 204 with an empty body', async () => {
    const user = await createAuthenticatedUser();

    const response = await logoutRequest(user.accessToken, user.refreshToken);

    assert.equal(response.status, 204);
    assert.equal(response.text, '');

    const storedRow = await prisma.refreshToken.findUnique({
      where: { token_hash: sha256(user.refreshToken) },
    });
    assert.ok(storedRow);
    assert.ok(storedRow.revoked_at, 'the token should be revoked in the database');

    // The logged-out token no longer grants new token pairs.
    const refreshAfterLogout = await refreshRequest(user.refreshToken);
    assert.equal(refreshAfterLogout.status, 401);
  });

  it('ends the whole session chain: tokens issued before logout are dead too', async () => {
    const user = await createAuthenticatedUser();
    const rotation = await refreshRequest(user.refreshToken); // family now has 2 tokens
    assert.equal(rotation.status, 200);
    const newestToken = rotation.body.data.refreshToken;

    // Log out presenting the newest member of the family.
    const response = await logoutRequest(rotation.body.data.accessToken, newestToken);
    assert.equal(response.status, 204);

    // Every family member must be revoked.
    const familyRows = await prisma.refreshToken.findMany({ where: { user_id: user.userId } });
    assert.equal(familyRows.length, 2);
    for (const row of familyRows) {
      assert.ok(row.revoked_at);
    }
  });

  it('rejects a refresh token that belongs to another user with 401', async () => {
    const userA = await createAuthenticatedUser();
    const userB = await createAuthenticatedUser();

    const response = await logoutRequest(userA.accessToken, userB.refreshToken);

    assert.equal(response.status, 401);
    assert.equal(response.body.message, 'Invalid refresh token');

    // User B's session must be untouched.
    const bTokenRow = await prisma.refreshToken.findUnique({
      where: { token_hash: sha256(userB.refreshToken) },
    });
    assert.equal(bTokenRow.revoked_at, null);

    const stillWorks = await refreshRequest(userB.refreshToken);
    assert.equal(stillWorks.status, 200);

    // User A's own token was not collateral damage either.
    const aStillWorks = await refreshRequest(userA.refreshToken);
    assert.equal(aStillWorks.status, 200);
  });
});
