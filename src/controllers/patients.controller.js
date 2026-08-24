import * as patientService from '../services/patients.service.js';

export const updateMe = async (req, res, next) => {
  try {
    const profile = await patientService.updateOwnProfile(req.user.id, req.body);
    res.status(200).json({
      status: 'success',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};
