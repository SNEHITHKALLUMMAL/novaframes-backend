import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import {
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
} from '../validators/auth.validator.js';
import * as userController from '../controllers/user.controller.js';

const router = Router();

// All routes here operate on the authenticated user only ("/me") —
// there is no generic /users/:id in the public API; admin access to other
// users' records is a separate, admin-gated route added in Phase 19.
router.use(requireAuth);

router.get('/me', userController.getMyProfile);
router.patch('/me', validate({ body: updateProfileSchema }), userController.updateMyProfile);
router.patch(
  '/me/password',
  validate({ body: changePasswordSchema }),
  userController.changeMyPassword
);
router.delete('/me', validate({ body: deleteAccountSchema }), userController.deleteMyAccount);

export default router;
