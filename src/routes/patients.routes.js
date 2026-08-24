import {Router} from 'express';
import validate from '../middlewares/validate.middleware.js'
import * as patientsController from "../controllers/patients.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import * as validator from '../validators/patient.validator.js'

const router = Router();

router.patch('/patients/me', authenticate, requireRole('PATIENT'), validate(validator.updatePatientSchema), patientsController.updateMe);

export default router;
