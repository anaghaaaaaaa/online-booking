import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as controller from '../controllers/organizerController.js';
import { requestSchema } from '../validators/schemas.js';

const router = Router();
router.post('/', auth, requireRole('user'), validate(requestSchema), asyncHandler(controller.createRequest));
export default router;
