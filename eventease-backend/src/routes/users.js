import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as bookingController from '../controllers/bookingController.js';
import { noInputSchema } from '../validators/schemas.js';

const router = Router();
router.get('/dashboard/summary', auth, requireRole('user'), validate(noInputSchema), asyncHandler(bookingController.summary));
router.get('/tickets', auth, requireRole('user'), validate(noInputSchema), asyncHandler(bookingController.tickets));
export default router;
