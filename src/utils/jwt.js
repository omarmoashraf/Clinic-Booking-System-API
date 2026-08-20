import jwt from 'jsonwebtoken';
import config from '../config/index.js';

export const generateAccessToken = (user) => {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiresIn,
  });
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwt.secret);
};