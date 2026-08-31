import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as dashboardController from '../controllers/dashboard.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/summary', dashboardController.getSummary);

export default router;
