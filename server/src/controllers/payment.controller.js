import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import * as subscriptionService from '../services/subscription.service.js';
import { getPaymentProvider } from '../services/payments/index.js';
import { logger } from '../utils/logger.js';

export const listMyPayments = asyncHandler(async (req, res) => {
  const payments = await subscriptionService.listMyPayments(req.user._id);
  sendSuccess(res, { message: 'Payment history retrieved', data: { payments } });
});

/**
 * Webhook receiver. Deliberately does NOT use requireAuth — the caller is
 * the payment provider's servers, not a logged-in user; authenticity is
 * established by verifying the signature instead (verifyAndParseWebhook,
 * below). req.body is the raw Buffer here (see app.js's express.raw()
 * mount for this exact path) — never parsed JSON, since the provider's
 * signature is computed over the exact raw bytes.
 *
 * Always responds quickly and with 2xx once the event is durably recorded
 * (even if processing hits a business-logic error) — providers retry on
 * non-2xx, and retry storms on a real, non-retryable error just add noise.
 * Only signature-invalid requests get rejected outright.
 */
export const handleWebhook = asyncHandler(async (req, res) => {
  const provider = getPaymentProvider();
  const signature = req.headers['stripe-signature'] || req.headers['x-webhook-signature'];

  let event;
  try {
    event = provider.verifyAndParseWebhook(req.body, signature);
  } catch (err) {
    logger.warn(`Webhook signature verification failed: ${err.message}`);
    throw ApiError.unauthorized('Invalid webhook signature');
  }

  await subscriptionService.handleWebhookEvent(event);
  // Providers only care about the HTTP status, not the response body —
  // still using sendSuccess for consistency with the rest of the API.
  sendSuccess(res, { message: 'Webhook processed' });
});

/**
 * Dev-only — see routes/payments.routes.js (only registered outside
 * production, with PAYMENT_PROVIDER=dev-stub). Lets a developer complete a
 * simulated checkout without a real payment provider, exercising the same
 * handleWebhookEvent() path production webhooks use.
 */
export const simulateDevCheckout = asyncHandler(async (req, res) => {
  const provider = getPaymentProvider();
  if (typeof provider.simulateCheckoutCompleted !== 'function') {
    throw ApiError.badRequest('Current payment provider does not support checkout simulation');
  }
  const event = provider.simulateCheckoutCompleted(req.params.sessionId);
  await subscriptionService.handleWebhookEvent(event);
  sendSuccess(res, { message: 'Simulated checkout completed', data: { event } });
});
