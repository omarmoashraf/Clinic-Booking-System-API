import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import { setupTestDatabase, teardownTestDatabase } from '../helpers/db.js';

describe('Docs and Security Hardening', () => {
  before(async () => {
    await setupTestDatabase();
  });

  after(teardownTestDatabase);

  describe('Milestone 15 — API Documentation (Swagger)', () => {
    it('serves OpenAPI 3.0 specification JSON at GET /api/docs.json', async () => {
      const res = await request(app).get('/api/docs.json');
      assert.equal(res.status, 200);
      assert.equal(res.body.openapi, '3.0.3');
      assert.equal(res.body.info.title, 'Clinic Booking API');
      assert.ok(res.body.paths['/health']);
      assert.ok(res.body.paths['/admin/users']);
    });

    it('serves Swagger UI at GET /api/docs/', async () => {
      const res = await request(app).get('/api/docs/');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('swagger-ui') || res.text.includes('Swagger UI'));
    });
  });

  describe('Milestone 16 — Security Hardening', () => {
    it('includes Helmet security headers and CORS headers in HTTP responses', async () => {
      const res = await request(app).get('/api/v1/health');
      assert.equal(res.status, 200);

      // CORS header
      assert.ok(res.headers['access-control-allow-origin']);

      // Helmet security headers
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.ok(res.headers['x-dns-prefetch-control'] || res.headers['cross-origin-opener-policy']);
    });
  });
});
