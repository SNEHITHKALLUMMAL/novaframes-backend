import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { listModelsQuerySchema } from '../validators/model.validator.js';
import * as modelController from '../controllers/model.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', validate({ query: listModelsQuerySchema }), modelController.listModels);

export default router;
