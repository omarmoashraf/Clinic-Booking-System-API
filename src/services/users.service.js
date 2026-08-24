import * as userRepo from '../repositories/user.repository.js';
import { NotFoundError } from '../errors/AppError.js';

// Date-only serialization for Patient.date_of_birth: the repository returns
// a Date at UTC midnight, so slicing the ISO string yields the exact stored
// calendar date independent of the server's timezone.
const toDateOnly = (date) => (date ? date.toISOString().slice(0, 10) : null);

/**
 * Shape of the authenticated user merged with their role-specific profile
 * (docs/API.md — GET /users/me). Shared by /users/me and /patients/me so both
 * endpoints speak the same profile shape. Input is the findByIdWithProfile row;
 * password hash and auth state never reach this mapper (repository select).
 */
export const mapMergedProfile = (user) => {
  const base = {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    role: user.role,
    isActive: user.is_active,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };

  if (user.role === 'DOCTOR') {
    return {
      ...base,
      doctor: user.doctor
        ? {
            id: user.doctor.id,
            specialty: user.doctor.specialty,
            bio: user.doctor.bio,
          }
        : undefined,
    };
  }

  if (user.role === 'PATIENT') {
    return {
      ...base,
      patient: user.patient
        ? {
            id: user.patient.id,
            dateOfBirth: toDateOnly(user.patient.date_of_birth),
          }
        : undefined,
    };
  }

  // Roles without a role-specific profile (ADMIN) return account data only.
  return base;
};

/**
 * The authenticated user together with their Doctor or Patient profile.
 * A PATIENT never receives doctor data and vice versa; ADMIN receives no
 * profile at all. A role whose profile row is missing is an integrity error.
 */
export const getCurrentUser = async (userId) => {
  const user = await userRepo.findByIdWithProfile(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.role === 'DOCTOR' && !user.doctor) {
    throw new NotFoundError('Doctor');
  }

  if (user.role === 'PATIENT' && !user.patient) {
    throw new NotFoundError('Patient');
  }

  return mapMergedProfile(user);
};
