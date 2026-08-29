import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import {
  listAdminUsersSchema,
  updateAdminUserSchema,
  listAdminAppointmentsSchema,
} from '../validators/admin.validator.js';
import * as adminController from '../controllers/admin.controller.js';

const router = Router();

// All admin endpoints require authentication and ADMIN role
router.use(authenticate, requireRole('ADMIN'));

router.get('/users', validate(listAdminUsersSchema), adminController.getUsers);
router.patch('/users/:id', validate(updateAdminUserSchema), adminController.updateUser);
router.get('/appointments', validate(listAdminAppointmentsSchema), adminController.getAppointments);

export default router;
