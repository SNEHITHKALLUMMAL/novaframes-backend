import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { listPlanDefinitions } from '../constants/plans.js';
import * as subscriptionService from '../services/subscription.service.js';

export const listPlans = asyncHandler(async (req, res) => {
  // PLAN_DEFINITIONS is a static in-code constant (constants/plans.js) —
  // it cannot change without a deploy, so this is safe to cache
  // considerably longer than the model catalog (which an admin can change
  // live).
  res.set('Cache-Control', 'private, max-age=300');
  sendSuccess(res, { message: 'Plans retrieved', data: { plans: listPlanDefinitions() } });
});

export const getMySubscription = asyncHandler(async (req, res) => {
  const result = await subscriptionService.getMySubscriptionWithPlan(req.user._id);
  sendSuccess(res, { message: 'Subscription retrieved', data: result });
});

export const subscribe = asyncHandler(async (req, res) => {
  const { subscription, checkoutUrl } = await subscriptionService.startCheckout(
    req.user._id,
    req.user.email,
    req.body
  );
  if (checkoutUrl) {
    sendSuccess(res, { message: 'Checkout session created', data: { checkoutUrl } });
  } else {
    sendSuccess(res, { message: 'Subscription updated', data: { subscription } });
  }
});

export const cancel = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.cancelSubscription(req.user._id);
  sendSuccess(res, {
    message: 'Subscription will be cancelled at the end of the current period',
    data: { subscription },
  });
});

export const reactivate = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.reactivateSubscription(req.user._id);
  sendSuccess(res, { message: 'Subscription reactivated', data: { subscription } });
});
