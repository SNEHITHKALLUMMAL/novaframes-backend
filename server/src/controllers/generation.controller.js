import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import * as generationService from '../services/generation.service.js';

export const createJob = asyncHandler(async (req, res) => {
  const job = await generationService.createGenerationJob(req.user._id, req.body);
  sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Generation job created and queued',
    data: { job },
  });
});

export const listJobs = asyncHandler(async (req, res) => {
  const result = await generationService.listGenerationJobs(req.user._id, req.query);
  sendSuccess(res, { message: 'Generation jobs retrieved', data: result });
});

export const getJob = asyncHandler(async (req, res) => {
  const job = await generationService.getGenerationJob(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Generation job retrieved', data: { job } });
});

export const cancelJob = asyncHandler(async (req, res) => {
  const job = await generationService.cancelGenerationJob(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Generation job cancelled', data: { job } });
});

export const queueStats = asyncHandler(async (req, res) => {
  const stats = await generationService.getQueueStats();
  sendSuccess(res, { message: 'Queue statistics retrieved', data: { stats } });
});
