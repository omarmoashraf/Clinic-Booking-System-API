/**
 * Auth test helpers
 *
 * Small, focused helpers shared by the auth integration tests:
 * - fire requests at the real Express app with supertest
 * - create users/tokens directly through the API where possible
 * - a few low-level utilities for cases the API cannot produce
 *   (expired refresh tokens, expired access tokens)
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/lib/prisma.js';
import config from '../../src/config/index.js';

export const TEST_PASSWORD = 'Password123!';

/** Unique email per call so tests never depend on each other's data. */
export const uniqueEmail = (prefix = 'user') =>
  `${prefix}.${crypto.randomUUID()}@test.example`;

/** Mirrors the service's hashing of raw refresh tokens (sha256 hex). */
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Same shape the service generates: 48 random bytes as hex (96 chars). */
export const generateRefreshTokenValue = () => crypto.randomBytes(48).toString('hex');

const BASE = '/api/v1/auth';

export const registerRequest = (body) => request(app).post(`${BASE}/register`).send(body);

export const loginRequest = (email, password) =>
  request(app).post(`${BASE}/login`).send({ email, password });

export const refreshRequest = (refreshToken) =>
  request(app).post(`${BASE}/refresh`).send({ refreshToken });

export const logoutRequest = (accessToken, refreshToken) =>
  request(app).post(`${BASE}/logout`).send({ refreshToken }).auth(accessToken, { type: 'bearer' });

/**
 * Register through the API and return `{ email, password, response }`.
 * `overrides` are merged into the registration body.
 */
export async function registerUser(overrides = {}) {
  const body = {
    email: uniqueEmail(),
    password: TEST_PASSWORD,
    fullName: 'Test User',
    role: 'PATIENT',
    ...overrides,
  };
  const response = await registerRequest(body);
  return { body, response };
}

/** Register + login through the API; returns credentials plus both tokens. */
export async function createAuthenticatedUser(roleOverrides = {}) {
  const { body, response } = await registerUser(roleOverrides);
  if (response.status !== 201) {
    throw new Error(`test setup: registration failed: ${JSON.stringify(response.body)}`);
  }

  const loginResponse = await loginRequest(body.email, body.password);
  if (loginResponse.status !== 200) {
    throw new Error(`test setup: login failed: ${JSON.stringify(loginResponse.body)}`);
  }

  return {
    userId: response.body.data.id,
    email: body.email,
    password: body.password,
    role: response.body.data.role,
    accessToken: loginResponse.body.data.accessToken,
    refreshToken: loginResponse.body.data.refreshToken,
  };
}

/**
 * Create a Specialty row directly. There is no admin API yet
 * (specialties arrive in Milestone 9), so tests seed this fixture
 * through Prisma.
 */
export function createSpecialty(name) {
  return prisma.specialty.create({
    data: { name: name ?? `Specialty-${crypto.randomUUID()}` },
  });
}

/**
 * Insert a RefreshToken row directly and return the raw token value.
 * Used to produce states the API cannot reach on demand,
 * e.g. an already-expired token (`expiresAt` in the past).
 */
export async function insertRefreshToken({ userId, expiresAt }) {
  const rawToken = generateRefreshTokenValue();
  await prisma.refreshToken.create({
    data: {
      user_id: userId,
      family_id: crypto.randomUUID(),
      token_hash: sha256(rawToken),
      expires_at: expiresAt,
    },
  });
  return rawToken;
}

/**
 * Sign an access token that is already expired, using the same payload
 * shape and secret as the application. Used to test middleware behavior
 * without waiting for a real token lifetime to elapse.
 */
export function generateExpiredAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, { expiresIn: '-1h' });
}
