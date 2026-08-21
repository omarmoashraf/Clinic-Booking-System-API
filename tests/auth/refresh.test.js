import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { setupTestDatabase, teardownTestDatabase, prisma } from '../helpers/db.js';
import {
  createAuthenticatedUser,
  generateRefreshTokenValue,
  insertRefreshToken,
  refreshRequest,
  registerUser,
  sha256,
} from '../helpers/auth.js';

before(setupTestDatabase);
after(teardownTestDatabase);

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the token and returns a new usable pair', async () => {
    const user = await createAuthenticatedUser();

    const first = await refreshRequest(user.refreshToken);
    assert.equal(first.status, 200);
    assert.equal(first.body.status, 'success');

    const data = first.body.data;
    assert.deepEqual(Object.keys(data).sort(), ['accessToken', 'refreshToken', 'user']);
    assert.equal(data.user.id, user.userId);
    assert.notEqual(data.refreshToken, user.refreshToken, 'a new refresh token must be issued');
    assert.ok(data.accessToken.length > 0);

    // The presented token is now revoked and points at its replacement.
    const oldRow = await prisma.refreshToken.findUnique({
      where: { token_hash: sha256(user.refreshToken) },
    });
    assert.ok(oldRow.revoked_at, 'old token should be revoked after rotation');
    assert.equal(oldRow.replaced_by, sha256(data.refreshToken));

    // The replacement row exists and is still active.
    const newRow = await prisma.refreshToken.findUnique({
      where: { token_hash: sha256(data.refreshToken) },
    });
    assert.ok(newRow);
    assert.equal(newRow.revoked_at, null);

    // The new pair is actually usable: it rotates again successfully.
    const second = await refreshRequest(data.refreshToken);
    assert.equal(second.status, 200);
  });

  it('rejects the old token after rotation and revokes the whole family (reuse detection)', async () => {
    const user = await createAuthenticatedUser();
    const rotation = await refreshRequest(user.refreshToken);
    assert.equal(rotation.status, 200);
    const rotatedToken = rotation.body.data.refreshToken;

    // Presenting the already-rotated token is treated as possible theft.
    const reuse = await refreshRequest(user.refreshToken);
    assert.equal(reuse.status, 401);
    assert.equal(reuse.body.message, 'Invalid refresh token');

    // Milestone 7 contract: the ENTIRE family is revoked - including the
    // token that was legitimately issued by the earlier rotation.
    const familyRows = await prisma.refreshToken.findMany({
      where: { user_id: user.userId },
    });
    assert.equal(familyRows.length, 2);
    for (const row of familyRows) {
      assert.ok(row.revoked_at, `token ${row.token_hash.slice(0, 8)} should be revoked`);
    }

    // The legitimate token is dead too.
    const deadLegitimate = await refreshRequest(rotatedToken);
    assert.equal(deadLegitimate.status, 401);
  });

  it('rejects an expired refresh token with 401', async () => {
    const { response } = await registerUser();
    const userId = response.body.data.id;

    const expiredToken = await insertRefreshToken({
      userId,
      expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired an hour ago
    });

    const refreshResponse = await refreshRequest(expiredToken);

    assert.equal(refreshResponse.status, 401);
    assert.equal(refreshResponse.body.message, 'Invalid refresh token');
  });

  it('rejects a refresh attempt for a deactivated user with 401', async () => {
    const user = await createAuthenticatedUser();

    await prisma.user.update({
      where: { id: user.userId },
      data: { is_active: false },
    });

    const response = await refreshRequest(user.refreshToken);

    assert.equal(response.status, 401);
    assert.equal(response.body.status, 'unauthorized');
    assert.equal(response.body.message, 'Invalid refresh token');
  });

  it('rejects an unknown refresh token with 401', async () => {
    const response = await refreshRequest(generateRefreshTokenValue());

    assert.equal(response.status, 401);
    assert.equal(response.body.message, 'Invalid refresh token');
  });
});
