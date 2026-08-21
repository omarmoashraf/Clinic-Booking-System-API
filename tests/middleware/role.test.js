import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requireRole } from '../../src/middlewares/role.middleware.js';
import { ForbiddenError } from '../../src/errors/AppError.js';

/**
 * `requireRole` is a middleware factory. It is not mounted on any route yet
 * (protected feature routes arrive in Milestone 9+), so these tests invoke
 * the returned middleware directly with minimal req/res/next stand-ins and
 * assert the exact contract it must uphold once routes exist.
 */
function runMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    const res = {};
    try {
      middleware(req, res, (error) => {
        if (error) reject(error);
        else resolve({ proceeded: true });
      });
    } catch (error) {
      reject(error);
    }
  });
}

describe('requireRole middleware', () => {
  it('lets the request proceed when the user has the required role', async () => {
    const middleware = requireRole('PATIENT');
    const result = await runMiddleware(middleware, { user: { id: 'u1', role: 'PATIENT' } });

    assert.deepEqual(result, { proceeded: true });
  });

  it('lets the request proceed for any of several allowed roles', async () => {
    const middleware = requireRole('DOCTOR', 'ADMIN');
    const result = await runMiddleware(middleware, { user: { id: 'u2', role: 'ADMIN' } });

    assert.deepEqual(result, { proceeded: true });
  });

  it('rejects with 403 when the role does not match', async () => {
    const middleware = requireRole('ADMIN');

    await assert.rejects(
      () => runMiddleware(middleware, { user: { id: 'u3', role: 'PATIENT' } }),
      (error) => {
        assert.ok(error instanceof ForbiddenError);
        assert.equal(error.statusCode, 403);
        assert.equal(error.status, 'forbidden');
        assert.equal(error.message, 'Insufficient Permissions');
        return true;
      }
    );
  });

  it('rejects with 403 when req.user is missing entirely', async () => {
    const middleware = requireRole('DOCTOR');

    await assert.rejects(
      () => runMiddleware(middleware, {}),
      (error) => {
        assert.ok(error instanceof ForbiddenError);
        assert.equal(error.statusCode, 403);
        return true;
      }
    );
  });
});
