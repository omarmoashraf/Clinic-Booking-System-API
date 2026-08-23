import {Router} from 'express';
import validate from '../middlewares/validate.middleware.js'
import { create , update , getById , remove ,list, } from "../controllers/specialties.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import * as validator from '../validators/specialty.validator.js'

const router = Router();

router.get('/specialties' ,validate(validator.listSpecialtiesSchema),  list);
router.get('/specialties/:id', validate(validator.getSpecialtySchema), getById);
router.post('/specialties' , authenticate , requireRole('ADMIN'),validate(validator.createSpecialtySchema), create);
router.patch('/specialties/:id', authenticate, requireRole('ADMIN'), validate(validator.updateSpecialtySchema), update);
router.delete('/specialties/:id' , authenticate,requireRole('ADMIN'),validate(validator.deleteSpecialtySchema),remove);

export default router;