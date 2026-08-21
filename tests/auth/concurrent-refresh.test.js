import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { setupTestDatabase, teardownTestDatabase, prisma } from '../helpers/db.js';
import { createAuthenticatedUser, refreshRequest, sha256 } from '../helpers/auth.js';

before(setupTestDatabase);
after(teardownTestDatabase);

/**
 * Milestone 7 concurrency guarantee:
 *
 * Two simultaneous /auth/refresh requests with the SAME token must result in
 * exactly one success and one 401. The loser detects that the token was
 * rotated underneath it (revokeIfActive count === 0) and revokes the whole
 * token family - including the brand-new token the winner just received.
 */
describe('concurrent refresh with the same token', () => {
  it('lets exactly one request win, rejects the other, and revokes the family', async () => {
    const user = await createAuthenticatedUser();

    const [winnerResponse, loserResponse] = await Promise.all([
      refreshRequest(user.refreshToken),
      refreshRequest(user.refreshToken),
    ]);

    // Exactly one success and one rejection.
    assert.deepEqual(
      [winnerResponse.status, loserResponse.status].sort(),
      [200, 401],
      'exactly one of the two concurrent refreshes should succeed'
    );

    const winner = winnerResponse.status === 200 ? winnerResponse : loserResponse;
    assert.equal(winner.body.status, 'success');
    assert.equal(typeof winner.body.data.refreshToken, 'string');
    assert.equal(loserResponse.body.message, 'Invalid refresh token');

    // The same raw token must not be rotated twice: only ONE new family
    // member exists (the original row + the single replacement).
    const newTokenHash = sha256(winner.body.data.refreshToken);
    const familyRows = await prisma.refreshToken.findMany({
      where: { user_id: user.userId },
    });
    assert.equal(familyRows.length, 2, 'family should contain only original + one rotation');

    // Family state is consistent: everything is revoked, including the
    // token the winner just received.
    for (const row of familyRows) {
      assert.ok(row.revoked_at, `token ${row.token_hash.slice(0, 8)} should be revoked`);
    }
    const issuedRow = await prisma.refreshToken.findUnique({ where: { token_hash: newTokenHash } });
    assert.ok(issuedRow, "the winner's new token should be persisted");
    assert.ok(issuedRow.revoked_at, "the winner's new token should be revoked by reuse detection");

    // End-to-end proof that the chain is dead: even the winner's fresh
    // token no longer works.
    const postRace = await refreshRequest(winner.body.data.refreshToken);
    assert.equal(postRace.status, 401);
  });
});
