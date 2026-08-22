import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as paymentController from '../controllers/payment.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', paymentController.listMyPayments);

export default router;
