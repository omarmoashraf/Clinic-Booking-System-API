import * as adminService from '../services/admin.service.js';

export const getUsers = async (req, res, next) => {
  try {
    const result = await adminService.listUsers(req.query);
    res.json({
      status: 'success',
      data: result.users,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const user = await adminService.updateUser(req.params.id, req.body);
    res.json({
      status: 'success',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

export const getAppointments = async (req, res, next) => {
  try {
    const result = await adminService.listAppointments(req.query);
    res.json({
      status: 'success',
      data: result.appointments,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
};
