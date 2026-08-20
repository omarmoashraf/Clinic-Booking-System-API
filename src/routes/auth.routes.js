import {Router} from 'express';
import validate from '../middlewares/validate.middleware.js'
import{
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} from '../validators/auth.validator.js'
import * as authController from '../controllers/auth.controller.js'
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();
router.post('/register', validate(registerSchema),authController.register);
router.post('/login' , validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshSchema), authController.refresh);
router.post('/logout', authenticate, validate(logoutSchema), authController.logout);

export default router;
