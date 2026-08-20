import prisma from '../lib/prisma.js';

export const findByTokenHash = (tokenHash, client = prisma) => {
  return client.refreshToken.findUnique({ where: { token_hash: tokenHash } });
};

export const create = (data, client = prisma) => {
  return client.refreshToken.create({ data });
};

export const revokeIfActive = (id, replacedBy, client = prisma) => {
  return client.refreshToken.updateMany({
    where: { id, revoked_at: null },
    data: { revoked_at: new Date(), replaced_by: replacedBy },
  });
};

export const revokeFamily = (familyId, client = prisma) => {
  return client.refreshToken.updateMany({
    where: { family_id: familyId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
};

export const revokeAllForUser = (userId, client = prisma) => {
  return client.refreshToken.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
};