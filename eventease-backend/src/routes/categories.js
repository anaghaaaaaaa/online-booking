import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as controller from '../controllers/eventController.js';
import { noInputSchema } from '../validators/schemas.js';

const router = Router();
router.get('/', validate(noInputSchema), asyncHandler(controller.categories));
export default router;
