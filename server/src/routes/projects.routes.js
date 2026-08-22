import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createProjectSchema, updateProjectSchema } from '../validators/project.validator.js';
import * as projectController from '../controllers/project.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', validate({ body: createProjectSchema }), projectController.createProject);
router.get('/', projectController.listProjects);
router.get('/:id', validate({ params: idParamSchema }), projectController.getProject);
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateProjectSchema }),
  projectController.updateProject
);
router.delete('/:id', validate({ params: idParamSchema }), projectController.deleteProject);

export default router;
