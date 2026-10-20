import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as controller from '../controllers/eventController.js';
import { eventIdSchema, publicEventsSchema } from '../validators/schemas.js';

const router = Router();
router.get('/', validate(publicEventsSchema), asyncHandler(controller.list));
router.get('/:id', validate(eventIdSchema), asyncHandler(controller.get));
export default router;
