import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import * as subscriptionService from '../services/subscription.service.js';

export const listMyPayments = asyncHandler(async (req, res) => {
  const payments = await subscriptionService.listMyPayments(req.user._id);
  sendSuccess(res, { message: 'Payment history retrieved', data: { payments } });
});
