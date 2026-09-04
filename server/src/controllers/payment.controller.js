import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import * as subscriptionService from '../services/subscription.service.js';
import { getPaymentProvider } from '../services/payments/index.js';
import { RazorpayPaymentProvider } from '../../services/payments/RazorpayPaymentProvider.js';
import { getPlanDefinition } from '../constants/plans.js';
import { Payment } from '../../models/Payment.model.js';
import { PAYMENT_STATUS } from '../constants/enums.js';
import { logger } from '../utils/logger.js';

export const listMyPayments = asyncHandler(async (req, res) => {
  const payments = await subscriptionService.listMyPayments(req.user._id);
  sendSuccess(res, { message: 'Payment history retrieved', data: { payments } });
});

/**
 * Razorpay order creation endpoint.
 * Creates a Razorpay order for the frontend popup checkout.
 * The plan and pricing are determined server-side — the frontend never
 * controls the amount.
 */
export const createOrder = asyncHandler(async (req, res) => {
  const provider = getPaymentProvider();
  if (!(provider instanceof RazorpayPaymentProvider)) {
    throw ApiError.badRequest('Order creation is only available with the Razorpay payment provider');
  }

  const { plan, billingCycle = 'monthly' } = req.body;
  const planDefinition = getPlanDefinition(plan);

  if (!planDefinition) {
    throw ApiError.badRequest(`Unknown plan: ${plan}`);
  }

  const amountCents =
    billingCycle === 'yearly' ? planDefinition.priceYearlyCents : planDefinition.priceMonthlyCents;

  if (amountCents === 0) {
    throw ApiError.badRequest('Free plan does not require payment');
  }

  // Create Razorpay order (amount in paise for INR)
  const order = await provider.createOrder({
    userId: req.user._id,
    planId: plan,
    billingCycle,
    amountCents,
  });

  // Store a pending payment record for later verification
  await Payment.create({
    user: req.user._id,
    amount: amountCents,
    currency: 'INR',
    provider: 'razorpay',
    status: PAYMENT_STATUS.PENDING,
    providerSessionId: order.orderId,
    // Store plan metadata in the payment for verification
    invoiceUrl: JSON.stringify({ planId: plan, billingCycle }),
  });

  sendSuccess(res, {
    message: 'Order created',
    data: {
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: provider.razorpay.key_id,
    },
  });
});

/**
 * Razorpay payment verification endpoint.
 * After the frontend popup succeeds, it calls this endpoint with the
 * Razorpay response. The backend verifies the signature server-side
 * and activates the subscription.
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const provider = getPaymentProvider();
  if (!(provider instanceof RazorpayPaymentProvider)) {
    throw ApiError.badRequest('Payment verification is only available with the Razorpay payment provider');
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw ApiError.badRequest('Missing required Razorpay payment verification fields');
  }

  // Verify signature server-side
  provider.verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  // Find the pending payment
  const payment = await Payment.findOne({
    providerSessionId: razorpay_order_id,
    user: req.user._id,
    status: PAYMENT_STATUS.PENDING,
  });

  if (!payment) {
    throw ApiError.notFound('No pending payment found for this order');
  }

  // Parse plan info we stored during order creation
  let planId, billingCycle;
  try {
    const meta = JSON.parse(payment.invoiceUrl || '{}');
    planId = meta.planId;
    billingCycle = meta.billingCycle || 'monthly';
  } catch {
    throw ApiError.internal('Could not read payment metadata');
  }

  // Mark payment as succeeded
  payment.status = PAYMENT_STATUS.SUCCEEDED;
  payment.providerPaymentId = razorpay_payment_id;
  await payment.save();

  // Activate subscription via the same webhook-event code path
  await subscriptionService.handleWebhookEvent({
    type: 'payment.captured',
    providerEventId: `verify_${razorpay_payment_id}`,
    data: {
      providerPaymentId: razorpay_payment_id,
      providerOrderId: razorpay_order_id,
      providerSubscriptionId: null,
      userId: req.user._id.toString(),
      planId,
      billingCycle,
      status: 'succeeded',
      amount: payment.amount,
    },
  });

  sendSuccess(res, { message: 'Payment verified and subscription activated' });
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
  // Razorpay sends the signature in the x-razorpay-signature header
  const signature =
    req.headers['x-razorpay-signature'] ||
    req.headers['stripe-signature'] ||
    req.headers['x-webhook-signature'];

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
