import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  listUsersQuerySchema,
  setUserRoleSchema,
  setUserActiveSchema,
  listAdminJobsQuerySchema,
  createModelSchema,
  updateModelFullSchema,
  createModelVersionSchema,
  listAdminSubscriptionsQuerySchema,
  listAdminPaymentsQuerySchema,
  listWebhookEventsQuerySchema,
  listAuditLogsQuerySchema,
} from '../validators/admin.validator.js';
import * as adminController from '../controllers/admin.controller.js';

const router = Router();

// Every route below requires both a valid session AND the admin role —
// applied once here rather than per-route, so a new admin route can never
// accidentally ship without this gate.
router.use(requireAuth, requireRole('admin'));

router.get('/overview', adminController.getOverview);

router.get('/users', validate({ query: listUsersQuerySchema }), adminController.listUsers);
router.patch(
  '/users/:id/role',
  requireRole('super_admin'), // defense-in-depth on top of the service-level canAssignRole() check — see utils/roleAuthorization.js
  validate({ params: idParamSchema, body: setUserRoleSchema }),
  adminController.setUserRole
);
router.patch(
  '/users/:id/status',
  validate({ params: idParamSchema, body: setUserActiveSchema }),
  adminController.setUserActive
);

router.get('/jobs', validate({ query: listAdminJobsQuerySchema }), adminController.listJobs);
router.post('/jobs/:id/retry', validate({ params: idParamSchema }), adminController.retryJob);

router.get('/models', adminController.listModels);
router.get('/models/adapters', adminController.listAvailableAdapters);
router.post('/models', validate({ body: createModelSchema }), adminController.createModel);
router.patch(
  '/models/:id',
  validate({ params: idParamSchema, body: updateModelFullSchema }),
  adminController.updateModel
);
router.delete('/models/:id', validate({ params: idParamSchema }), adminController.deleteModel);

router.get(
  '/models/:id/versions',
  validate({ params: idParamSchema }),
  adminController.listModelVersions
);
router.post(
  '/models/:id/versions',
  validate({ params: idParamSchema, body: createModelVersionSchema }),
  adminController.createModelVersion
);
router.delete(
  '/model-versions/:id',
  validate({ params: idParamSchema }),
  adminController.deleteModelVersion
);

router.get(
  '/subscriptions',
  validate({ query: listAdminSubscriptionsQuerySchema }),
  adminController.listSubscriptions
);

router.get('/storage', adminController.getStorageStats);
router.get('/config', adminController.getConfig);
router.get('/users/:id/usage-ledger', validate({ params: idParamSchema }), adminController.getUserUsageLedger);

router.get('/payments', validate({ query: listAdminPaymentsQuerySchema }), adminController.listPayments);
router.get(
  '/webhook-events',
  validate({ query: listWebhookEventsQuerySchema }),
  adminController.listWebhookEvents
);

router.get('/audit-logs', validate({ query: listAuditLogsQuerySchema }), adminController.listAuditLogs);

router.delete('/videos/:id', validate({ params: idParamSchema }), adminController.deleteVideo);

export default router;
