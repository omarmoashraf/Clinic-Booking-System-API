import * as patientRepo from '../repositories/patient.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import { NotFoundError } from '../errors/AppError.js';
import { mapMergedProfile } from './users.service.js';

/**
 * Self-service profile update.
 *
 * The Patient row is resolved from the authenticated user id (req.user.id),
 * never from client input, so a patient can only ever update their own
 * profile. There is no route accepting a patient id for updates.
 *
 * fullName/phone live on the owning User row while dateOfBirth lives on the
 * Patient row; both are written through one nested Prisma update, which is
 * transactional — the account and profile can never end up half-updated.
 * Omitted fields are left untouched (partial PATCH semantics).
 */
export const updateOwnProfile = async (userId, { fullName, phone, dateOfBirth }) => {
  const patient = await patientRepo.findByUserId(userId);
  if (!patient) {
    throw new NotFoundError('Patient');
  }

  const userData = {
    ...(fullName !== undefined && { full_name: fullName }),
    ...(phone !== undefined && { phone }),
  };

  const patientData = {
    ...(dateOfBirth !== undefined && { date_of_birth: dateOfBirth }),
    ...(Object.keys(userData).length > 0 && { user: { update: userData } }),
  };

  if (Object.keys(patientData).length > 0) {
    await patientRepo.update(patient.id, patientData);
  }

  const updated = await userRepo.findByIdWithProfile(userId);
  return mapMergedProfile(updated);
};
