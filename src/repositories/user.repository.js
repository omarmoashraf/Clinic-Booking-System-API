import prisma from '../lib/prisma.js';

/**
 * Find a user by their unique email.
 * Used by login and registration uniqueness checks.
 */
export const findUserByEmail = (email) => {
  return prisma.user.findUnique({ where: { email } });
};

/**
 * Find a user by their primary key.
 * Used by the auth middleware to verify the account is still active.
 */
export const findUserById = (id) => {
  return prisma.user.findUnique({ where: { id } });
};

/**
 * Create a user account.
 * Used by registration.
 */
export const createUser = (data) => {
  return prisma.user.create({ data });
};

/**
 * Update a user account.
 * Used by admin account management and profile updates.
 */
export const updateUser = (id, data) => {
  return prisma.user.update({ where: { id }, data });
};

const buildUserFilter = ({ role, isActive }) => ({
  ...(role ? { role } : {}),
  ...(isActive !== undefined ? { is_active: isActive } : {}),
});

/**
 * Paginated list of users with optional role and isActive filters.
 * Used by admin user management. Defaults and limit cap follow docs/API.md.
 */
export const findUsers = ({ page = 1, limit = 10, role, isActive } = {}) => {
  const take = Math.min(limit, 50);
  const skip = (page - 1) * take;

  return prisma.user.findMany({
    where: buildUserFilter({ role, isActive }),
    skip,
    take,
  });
};

/**
 * Count users matching the given filters, for pagination metadata.
 */
export const countUsers = ({ role, isActive } = {}) => {
  return prisma.user.count({
    where: buildUserFilter({ role, isActive }),
  });
};