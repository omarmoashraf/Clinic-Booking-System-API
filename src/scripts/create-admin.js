import config from '../config/index.js';
import prisma from '../lib/prisma.js';
import * as userRepo from '../repositories/user.repository.js';
import { hashPassword } from '../utils/hash.js';

/**
 * Local-only bootstrap script for creating an ADMIN account.
 *
 * Never exposed as an HTTP endpoint. Reads credentials from the environment:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULL_NAME
 *
 * Usage: npm run create-admin
 */
const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULL_NAME } = process.env;

if (config.env.isProd) {
  console.error('create-admin is a local bootstrap script and refuses to run in production.');
  process.exit(1);
}

if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_FULL_NAME) {
  console.error('ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_FULL_NAME must be set in the environment.');
  process.exit(1);
}

try {
  const existing = await userRepo.findUserByEmail(ADMIN_EMAIL.toLowerCase().trim());
  if (existing) {
    console.error(`An account with email ${ADMIN_EMAIL} already exists.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const admin = await userRepo.createUser({
    email: ADMIN_EMAIL.toLowerCase().trim(),
    password_hash: passwordHash,
    full_name: ADMIN_FULL_NAME,
    role: 'ADMIN',
  });

  console.log(`Admin account created: ${admin.email} (${admin.role})`);
} catch (error) {
  console.error('Failed to create admin account:', error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}