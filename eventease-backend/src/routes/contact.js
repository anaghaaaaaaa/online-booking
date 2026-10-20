import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as controller from '../controllers/contactController.js';
import { contactSchema } from '../validators/schemas.js';

const router = Router();
router.post('/', validate(contactSchema), asyncHandler(controller.create));
export default router;
