import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as controller from '../controllers/authController.js';
import { loginSchema, noInputSchema, passwordSchema, profileSchema, registerSchema } from '../validators/schemas.js';

const router = Router();
router.post('/register', authLimiter, validate(registerSchema), asyncHandler(controller.register));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(controller.login));
router.post('/logout', validate(noInputSchema), controller.logout);
router.get('/me', auth, validate(noInputSchema), controller.me);
router.put('/profile', auth, validate(profileSchema), asyncHandler(controller.updateProfile));
router.put('/password', auth, validate(passwordSchema), asyncHandler(controller.updatePassword));
export default router;
