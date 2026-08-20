import prisma from '../lib/prisma.js';

/**
 * Find a user by their unique email.
 * Used by login and registration uniqueness checks.
 */
export const findUserByEmail = (email, client = prisma) => {
  return client.user.findUnique({ where: { email } });
};

/**
 * Find a user by their primary key.
 * Used by the auth middleware to verify the account is still active.
 */
export const findUserById = (id, client = prisma) => {
  return client.user.findUnique({ where: { id } });
};

/**
 * Create a user account.
 * Used by registration.
 */
export const createUser = (data, client = prisma) => {
  return client.user.create({ data });
};

/**
 * Update a user account.
 * Used by admin account management and profile updates.
 */
export const updateUser = (id, data, client = prisma) => {
  return client.user.update({ where: { id }, data });
};

const buildUserFilter = ({ role, isActive }) => ({
  ...(role ? { role } : {}),
  ...(isActive !== undefined ? { is_active: isActive } : {}),
});

/**
 * Paginated list of users with optional role and isActive filters.
 * Used by admin user management. Defaults and limit cap follow docs/API.md.
 */
export const findUsers = ({ page = 1, limit = 10, role, isActive } = {}, client = prisma) => {
  const take = Math.min(limit, 50);
  const skip = (page - 1) * take;

  return client.user.findMany({
    where: buildUserFilter({ role, isActive }),
    skip,
    take,
  });
};

/**
 * Count users matching the given filters, for pagination metadata.
 */
export const countUsers = ({ role, isActive } = {}, client = prisma) => {
  return client.user.count({
    where: buildUserFilter({ role, isActive }),
  });
};

export const deactivateUser = (id, client = prisma) => {
  return client.user.update({
    where: { id },
    data: {
      is_active: false,
    },
  });
};

/**
 * Record a failed login attempt count.
 * Used by the login lockout policy.
 */
// export const setFailedLoginCount = (id, count, client = prisma) => {
//   return client.user.update({
//     where: { id },
//     data: { failed_login_count: count },
//   });
// };



export const incrementFailedLoginCount = (id, client = prisma) => {
  return client.user.update({
    where: { id },
    data: {
      failed_login_count: {
        increment: 1,
      },
    },
    select: {
      failed_login_count: true,
      locked_until: true,
    },
  });
};


/**
 * Lock an account until the given time and reset its attempt counter.
 * Used when the failed-attempt threshold is reached.
 */
export const setLockout = (id, lockedUntil, client = prisma) => {
  return client.user.update({
    where: { id },
    data: { failed_login_count: 0, locked_until: lockedUntil },
  });
};

/**
 * Clear lockout state after a successful login.
 */
export const resetFailedLogins = (id, client = prisma) => {
  return client.user.update({
    where: { id },
    data: { failed_login_count: 0, locked_until: null },
  });
};