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

// Only account fields that are safe to expose to the account owner.
// Sensitive auth state (password hash, lockout counters) never leaves
// the repository for profile lookups.
const safeUserSelect = {
  id: true,
  email: true,
  full_name: true,
  phone: true,
  role: true,
  is_active: true,
  created_at: true,
  updated_at: true,
};

/**
 * Find a user together with their role-specific profile in one query:
 * the Doctor row (with its specialty id/name) and/or the Patient row.
 * Used by GET /users/me. Admins have neither relation (both come back null).
 */
export const findByIdWithProfile = (id, client = prisma) => {
  return client.user.findUnique({
    where: { id },
    select: {
      ...safeUserSelect,
      doctor: {
        select: {
          id: true,
          bio: true,
          specialty: { select: { id: true, name: true } },
        },
      },
      patient: {
        select: {
          id: true,
          date_of_birth: true,
        },
      },
    },
  });
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
  const take = Math.min(limit, 100);
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