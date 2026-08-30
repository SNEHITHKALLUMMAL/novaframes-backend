import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { env, isProduction } from '../config/env.js';
import * as paymentController from '../controllers/payment.controller.js';

const router = Router();

// Webhook: authenticated by provider signature, not a user session — must
// come before requireAuth below, and must NOT have express.json() applied
// to it (see app.js, which mounts express.raw() for this exact path
// ahead of the global json parser).
router.post('/webhook', paymentController.handleWebhook);

// Dev-only: lets a local developer (or a test) simulate a user completing
// Stripe's hosted checkout, without a real Stripe account. Registered only
// when the dev-stub provider is active and never in production — the
// production guard is defense-in-depth on top of env.js already refusing
// to boot with PAYMENT_PROVIDER=dev-stub in production at all.
if (!isProduction && env.payment.provider === 'dev-stub') {
  router.post('/dev/simulate-checkout/:sessionId', paymentController.simulateDevCheckout);
}

router.use(requireAuth);
router.get('/', paymentController.listMyPayments);

export default router;
