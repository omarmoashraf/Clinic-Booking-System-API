import * as usersService from '../services/users.service.js';

export const getCurrentUser = async (req, res, next) => {
  try {
    const profile = await usersService.getCurrentUser(req.user.id);
    res.status(200).json({
      status: 'success',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};
