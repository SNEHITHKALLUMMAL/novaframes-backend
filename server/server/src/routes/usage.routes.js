import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as usageController from '../controllers/usage.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/me', usageController.getMyUsage);
router.get('/me/history', usageController.getMyUsageHistory);

export default router;
