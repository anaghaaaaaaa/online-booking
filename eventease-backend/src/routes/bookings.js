import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as controller from '../controllers/bookingController.js';
import { bookingCreateSchema, bookingIdSchema, listQuerySchema, noInputSchema } from '../validators/schemas.js';

const router = Router();
router.use(auth, requireRole('user'));
router.post('/', validate(bookingCreateSchema), asyncHandler(controller.create));
router.get('/', validate(listQuerySchema), asyncHandler(controller.list));
router.get('/:id', validate(bookingIdSchema), asyncHandler(controller.get));
router.post('/:id/cancel', validate(bookingIdSchema), asyncHandler(controller.cancel));
export default router;
