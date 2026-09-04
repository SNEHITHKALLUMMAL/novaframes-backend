import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { generationLimiter } from '../middleware/rateLimit.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  createGenerationJobSchema,
  listGenerationJobsQuerySchema,
} from '../validators/generation.validator.js';
import * as generationController from '../controllers/generation.controller.js';

const router = Router();

router.use(requireAuth);

// NOTE: /queue-stats must be registered before the /:id route, or Express
// would try to treat "queue-stats" as an :id value.
router.get('/queue-stats', requireRole('admin'), generationController.queueStats);

router.post(
  '/',
  generationLimiter,
  validate({ body: createGenerationJobSchema }),
  generationController.createJob
);
router.get('/', validate({ query: listGenerationJobsQuerySchema }), generationController.listJobs);
router.get('/:id', validate({ params: idParamSchema }), generationController.getJob);
router.post('/:id/cancel', validate({ params: idParamSchema }), generationController.cancelJob);

export default router;
