import * as appointmentsService from '../services/appointments.service.js';

export const book = async (req, res, next) => {
  try {
    const appointment = await appointmentsService.book(req.user.id, req.body);
    res.status(201).json({
      status: 'success',
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

export const listMine = async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;
    const { appointments, meta } = await appointmentsService.listMine(req.user, {
      page,
      limit,
      status,
    });
    res.status(200).json({
      status: 'success',
      data: appointments,
      meta,
    });
  } catch (error) {
    next(error);
  }
};

export const getById = async (req, res, next) => {
  try {
    const appointment = await appointmentsService.getById(req.user, req.params.id);
    res.status(200).json({
      status: 'success',
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

export const updateStatus = async (req, res, next) => {
  try {
    const appointment = await appointmentsService.updateStatus(
      req.user,
      req.params.id,
      req.body.status
    );
    res.status(200).json({
      status: 'success',
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};
