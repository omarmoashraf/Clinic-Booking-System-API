/**
 * Test database helper
 *
 * Every integration test file calls `setupTestDatabase()` in a top-level
 * `before()` hook and `teardownTestDatabase()` in an `after()` hook.
 *
 * What it does:
 * 1. Creates the dedicated test database (from DATABASE_URL) if missing.
 * 2. Applies migrations with `prisma migrate deploy` (idempotent).
 * 3. Truncates every table so each test starts from a clean state.
 *
 * The helper is intentionally small: it reuses the application's own
 * Prisma client, which is configured from the same DATABASE_URL that
 * `node --env-file=.env.test` injects into the environment.
 */
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import prisma from '../../src/lib/prisma.js';

const MIGRATIONS_TABLE = '_prisma_migrations';

/**
 * Parse the configured DATABASE_URL into its parts.
 * Used to connect to the maintenance database when creating the test DB.
 */
function parseDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL);
  return {
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    // Same server and credentials, but pointed at the always-present
    // "postgres" maintenance database (needed because CREATE DATABASE
    // cannot run while connected to the target database).
    adminUrl: (() => {
      const copy = new URL(process.env.DATABASE_URL);
      copy.pathname = '/postgres';
      return copy.toString();
    })(),
  };
}

/** Create the test database if it does not exist yet (needs a CREATEDB role). */
async function ensureDatabaseExists() {
  const { database, adminUrl } = parseDatabaseUrl();

  const client = new Client({ connectionString: adminUrl });

  await client.connect();
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE "${database}"`);
      console.log(`[test-setup] created test database "${database}"`);
    }
  } finally {
    await client.end();
  }
}

/** Apply all pending migrations with the Prisma CLI against the test DB. */
function runMigrations() {
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed with exit code ${result.status}`);
  }
}

/** Truncate every application table. Leaves the schema itself untouched. */
export async function resetDatabase() {
  const tables = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '${MIGRATIONS_TABLE}'`
  );

  if (tables.length === 0) return;

  const tableList = tables.map((row) => `"${row.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

/**
 * Full per-file setup. Safe to run many times:
 * creating the DB and migrating are both idempotent operations.
 */
export async function setupTestDatabase() {
  await ensureDatabaseExists();
  runMigrations();
  await resetDatabase();
}

/** Per-file teardown: leave a clean database behind and close connections. */
export async function teardownTestDatabase() {
  await resetDatabase();
  await prisma.$disconnect();
}

export { prisma };
