import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  listVideosQuerySchema,
  renameVideoSchema,
  assignVideoProjectSchema,
} from '../validators/video.validator.js';
import * as videoController from '../controllers/video.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listVideosQuerySchema }), videoController.listVideos);
router.get('/:id', validate({ params: idParamSchema }), videoController.getVideo);
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: renameVideoSchema }),
  videoController.renameVideo
);
router.patch(
  '/:id/project',
  validate({ params: idParamSchema, body: assignVideoProjectSchema }),
  videoController.assignVideoProject
);
router.delete('/:id', validate({ params: idParamSchema }), videoController.deleteVideo);

export default router;
