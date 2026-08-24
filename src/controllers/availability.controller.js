import * as availabilityService from '../services/availability.service.js';

export const listForDoctor = async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    const { from, to } = req.query;
    const slots = await availabilityService.listAvailableSlots({ doctorId, from, to });
    res.status(200).json({
      status: 'success',
      data: slots,
    });
  } catch (error) {
    next(error);
  }
};

export const create = async (req, res, next) => {
  try {
    const slot = await availabilityService.createSlot(req.user.id, req.body);
    res.status(201).json({
      status: 'success',
      data: slot,
    });
  } catch (error) {
    next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    await availabilityService.deleteSlot(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
