import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import * as overviewService from '../services/admin/adminOverview.service.js';
import * as usersService from '../services/admin/adminUsers.service.js';
import * as jobsService from '../services/admin/adminJobs.service.js';
import * as modelsService from '../services/admin/adminModels.service.js';
import * as modelVersionsService from '../services/admin/adminModelVersions.service.js';
import * as subscriptionsService from '../services/admin/adminSubscriptions.service.js';
import * as storageService from '../services/admin/adminStorage.service.js';
import * as configService from '../services/admin/adminConfig.service.js';
import * as auditLogService from '../services/adminAuditLog.service.js';
import { adminDeleteVideo } from '../services/video.service.js';
import { listUsageLedgerForUser } from '../services/usage.service.js';
import * as adminPaymentsService from '../services/admin/adminPayments.service.js';

export const getOverview = asyncHandler(async (req, res) => {
  const stats = await overviewService.getOverviewStats();
  sendSuccess(res, { message: 'Overview retrieved', data: stats });
});

export const listUsers = asyncHandler(async (req, res) => {
  const result = await usersService.listUsers(req.query);
  sendSuccess(res, { message: 'Users retrieved', data: result });
});

export const setUserRole = asyncHandler(async (req, res) => {
  const user = await usersService.setUserRole(req.user._id, req.user.role, req.params.id, req.body.role);
  sendSuccess(res, { message: 'User role updated', data: { user } });
});

export const setUserActive = asyncHandler(async (req, res) => {
  const user = await usersService.setUserActive(req.user._id, req.params.id, req.body.isActive);
  sendSuccess(res, { message: 'User status updated', data: { user } });
});

export const listJobs = asyncHandler(async (req, res) => {
  const result = await jobsService.listAllJobs(req.query);
  sendSuccess(res, { message: 'Jobs retrieved', data: result });
});

// SRS PHASE_08/09 "failed job recovery" — didn't exist before this phase.
export const retryJob = asyncHandler(async (req, res) => {
  const job = await jobsService.retryFailedJob(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Job requeued', data: { job } });
});

export const listModels = asyncHandler(async (req, res) => {
  const models = await modelsService.listAllModels();
  sendSuccess(res, { message: 'Models retrieved', data: { models } });
});

export const listAvailableAdapters = asyncHandler(async (req, res) => {
  const adapterKeys = modelsService.getAvailableAdapterKeys();
  sendSuccess(res, { message: 'Available adapters retrieved', data: { adapterKeys } });
});

export const createModel = asyncHandler(async (req, res) => {
  const model = await modelsService.createModel(req.user._id, req.body);
  sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: 'Model created', data: { model } });
});

export const updateModel = asyncHandler(async (req, res) => {
  const model = await modelsService.updateModel(req.user._id, req.params.id, req.body);
  sendSuccess(res, { message: 'Model updated', data: { model } });
});

export const deleteModel = asyncHandler(async (req, res) => {
  await modelsService.deleteModel(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Model deleted' });
});

export const listModelVersions = asyncHandler(async (req, res) => {
  const versions = await modelVersionsService.listVersions(req.params.id);
  sendSuccess(res, { message: 'Model versions retrieved', data: { versions } });
});

export const createModelVersion = asyncHandler(async (req, res) => {
  const version = await modelVersionsService.createVersion(req.user._id, req.params.id, req.body);
  sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: 'Model version created', data: { version } });
});

export const deleteModelVersion = asyncHandler(async (req, res) => {
  await modelVersionsService.deleteVersion(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Model version deleted' });
});

export const listSubscriptions = asyncHandler(async (req, res) => {
  const result = await subscriptionsService.listAllSubscriptions(req.query);
  sendSuccess(res, { message: 'Subscriptions retrieved', data: result });
});

export const getStorageStats = asyncHandler(async (req, res) => {
  const stats = await storageService.getStorageStats();
  sendSuccess(res, { message: 'Storage stats retrieved', data: stats });
});

export const getConfig = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Config retrieved', data: configService.getSystemConfigSnapshot() });
});

// SRS PHASE_12: "Add administrative auditability" — lets an admin see
// exactly which generation jobs charged or refunded a given user's quota,
// not just the current net total.
export const getUserUsageLedger = asyncHandler(async (req, res) => {
  const entries = await listUsageLedgerForUser(req.params.id);
  sendSuccess(res, { message: 'Usage ledger retrieved', data: { entries } });
});

// SRS PHASE_16: "Payment monitoring" — didn't exist before this phase.
export const listPayments = asyncHandler(async (req, res) => {
  const result = await adminPaymentsService.listAllPayments(req.query);
  sendSuccess(res, { message: 'Payments retrieved', data: result });
});

export const listWebhookEvents = asyncHandler(async (req, res) => {
  const result = await adminPaymentsService.listWebhookEvents(req.query);
  sendSuccess(res, { message: 'Webhook events retrieved', data: result });
});

export const listAuditLogs = asyncHandler(async (req, res) => {
  const result = await auditLogService.listAuditLogs(req.query);
  sendSuccess(res, { message: 'Audit logs retrieved', data: result });
});

export const deleteVideo = asyncHandler(async (req, res) => {
  await adminDeleteVideo(req.params.id);
  await auditLogService.writeAuditLog({
    actorId: req.user._id,
    action: 'video.moderated_delete',
    targetType: 'Video',
    targetId: req.params.id,
  });
  sendSuccess(res, { message: 'Video deleted' });
});
