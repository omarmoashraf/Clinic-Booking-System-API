import { Router } from 'express';
import validate from '../middlewares/validate.middleware.js';
import * as appointmentsController from '../controllers/appointments.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import * as validator from '../validators/appointment.validator.js';

const router = Router();

// /me must be matched before /:id
router.get('/appointments/me', authenticate, requireRole('PATIENT', 'DOCTOR'), validate(validator.listAppointmentsSchema), appointmentsController.listMine);

router.post('/appointments', authenticate, requireRole('PATIENT'), validate(validator.createAppointmentSchema), appointmentsController.book);

router.get('/appointments/:id', authenticate, requireRole('PATIENT', 'DOCTOR', 'ADMIN'), validate(validator.getAppointmentSchema), appointmentsController.getById);

// ADMIN has read-only appointment access (docs/API.md authorization matrix)
router.patch('/appointments/:id/status', authenticate, requireRole('PATIENT', 'DOCTOR'), validate(validator.updateAppointmentStatusSchema), appointmentsController.updateStatus);

export default router;
