import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/auth.validator.js';
import { idParamSchema } from '../validators/common.validator.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', authLimiter, authController.refresh);
router.post('/logout', authController.logout);

// authLimiter reused here deliberately — both endpoints accept unauthenticated
// input and both are classic brute-force/enumeration-probe targets.
router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword
);
router.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword
);
router.post('/verify-email', authLimiter, validate({ body: verifyEmailSchema }), authController.verifyEmail);

router.get('/me', requireAuth, authController.me);
router.post('/logout-all', requireAuth, authController.logoutAll);
router.get('/sessions', requireAuth, authController.listSessions);
router.delete('/sessions/:id', requireAuth, validate({ params: idParamSchema }), authController.revokeSession);
router.post('/resend-verification', requireAuth, authController.resendVerification);

export default router;
