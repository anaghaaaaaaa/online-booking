import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as controller from '../controllers/notificationController.js';
import { idOnlySchema, noInputSchema } from '../validators/schemas.js';
import { z } from 'zod';

const router = Router();
const listSchema = z.object({ query: z.object({ page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }) });
router.use(auth, requireRole('user', 'organizer'));
router.get('/', validate(listSchema), asyncHandler(controller.list));
router.patch('/read-all', validate(noInputSchema), asyncHandler(controller.readAll));
router.patch('/:id/read', validate(idOnlySchema), asyncHandler(controller.read));
export default router;
