import {Router} from 'express';
import validate from '../middlewares/validate.middleware.js'
import * as availabilityController from "../controllers/availability.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import * as validator from '../validators/availability.validator.js'

const router = Router();

// /me must be matched before /:doctorId
router.post('/doctors/me/availability', authenticate, requireRole('DOCTOR'), validate(validator.createAvailabilitySchema), availabilityController.create);
router.delete('/doctors/me/availability/:id', authenticate, requireRole('DOCTOR'), validate(validator.deleteAvailabilitySchema), availabilityController.remove);
router.get('/doctors/:doctorId/availability', validate(validator.listAvailabilitySchema), availabilityController.listForDoctor);

export default router;
