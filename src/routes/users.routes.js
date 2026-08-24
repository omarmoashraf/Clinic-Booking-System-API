import {Router} from 'express';
import * as usersController from "../controllers/users.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

// Any authenticated role; the service returns the role-appropriate profile.
router.get('/users/me', authenticate, usersController.getCurrentUser);

export default router;
