import {Router} from 'express';
import validate from '../middlewares/validate.middleware.js'
import * as doctorsController from "../controllers/doctors.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import * as validator from '../validators/doctor.validator.js'

const router = Router();

router.get('/doctors' ,validate(validator.listDoctorsSchema),  doctorsController.list);
// /me must be matched before /:id
router.patch('/doctors/me', authenticate, requireRole('DOCTOR'), validate(validator.updateDoctorSchema), doctorsController.updateMe);
router.get('/doctors/:id', validate(validator.getDoctorSchema), doctorsController.getById);

export default router;
