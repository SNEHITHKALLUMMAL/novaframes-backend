import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import * as usageService from '../services/usage.service.js';

export const getMyUsage = asyncHandler(async (req, res) => {
  const usage = await usageService.getMyUsage(req.user._id);
  sendSuccess(res, { message: 'Usage retrieved', data: usage });
});

export const getMyUsageHistory = asyncHandler(async (req, res) => {
  const history = await usageService.getUsageHistory(req.user._id);
  sendSuccess(res, { message: 'Usage history retrieved', data: { history } });
});
