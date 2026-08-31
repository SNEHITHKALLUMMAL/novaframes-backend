import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { subscribeSchema } from '../validators/subscription.validator.js';
import * as subscriptionController from '../controllers/subscription.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/plans', subscriptionController.listPlans);
router.get('/me', subscriptionController.getMySubscription);
router.post('/', validate({ body: subscribeSchema }), subscriptionController.subscribe);
router.post('/cancel', subscriptionController.cancel);
router.post('/reactivate', subscriptionController.reactivate);

export default router;
