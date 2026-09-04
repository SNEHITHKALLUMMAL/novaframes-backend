import { Subscription } from '../models/Subscription.model.js';
import { Payment } from '../models/Payment.model.js';
import { WebhookEvent } from '../models/WebhookEvent.model.js';
import { getPlanDefinition } from '../constants/plans.js';
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  WEBHOOK_EVENT_STATUS,
} from '../constants/enums.js';
import { getPaymentProvider } from './payments/index.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { addInterval } from '../utils/dateMath.js';
import { logger } from '../utils/logger.js';

/**
 * Every user effectively has a subscription — those who've never
 * subscribed are lazily given a Free plan record the first time anything
 * needs to check their plan, rather than every caller having to branch on
 * "does a Subscription document exist at all".
 */
export async function getOrCreateSubscription(userId) {
  let subscription = await Subscription.findOne({ user: userId });
  if (!subscription) {
    const now = new Date();
    subscription = await Subscription.create({
      user: userId,
      plan: SUBSCRIPTION_PLANS.FREE,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      billingCycle: 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: addInterval(now, 'monthly'),
    });
  }
  return subscription;
}

export async function getMySubscriptionWithPlan(userId) {
  const subscription = await getOrCreateSubscription(userId);
  return { subscription, planDefinition: getPlanDefinition(subscription.plan) };
}

/**
 * Entry point for the "choose a plan" UI action. Two outcomes:
 *  - Free plan (amountCents === 0): applied immediately, no payment
 *    provider involved at all — there's nothing to check out for.
 *  - Paid plan: creates a PENDING Payment record and a provider checkout
 *    session, returns a checkoutUrl for the frontend to redirect to. The
 *    subscription itself is NOT changed yet — that only happens once
 *    handleWebhookEvent() below receives the provider's confirmation.
 *    This is the real difference from the old synchronous charge() flow:
 *    a user choosing a paid plan does not have an active paid
 *    subscription until the webhook says so.
 */
export async function startCheckout(userId, userEmail, { plan, billingCycle }) {
  const planDefinition = getPlanDefinition(plan);
  const amountCents =
    billingCycle === 'yearly' ? planDefinition.priceYearlyCents : planDefinition.priceMonthlyCents;

  const subscription = await getOrCreateSubscription(userId);

  if (amountCents === 0) {
    applyPlanToSubscription(subscription, { plan, billingCycle, providerSubscriptionId: null });
    await subscription.save();
    return { subscription, checkoutUrl: null };
  }

  const provider = getPaymentProvider();
  const session = await provider.createCheckoutSession({
    userId: userId.toString(),
    userEmail,
    planId: plan,
    billingCycle,
    amountCents,
    successUrl: env.payment.successUrl,
    cancelUrl: env.payment.cancelUrl,
  });

  await Payment.create({
    user: userId,
    subscription: subscription._id,
    amount: amountCents,
    provider: env.payment.provider,
    status: PAYMENT_STATUS.PENDING,
    providerSessionId: session.providerSessionId,
  });

  return { subscription: null, checkoutUrl: session.checkoutUrl };
}

function applyPlanToSubscription(subscription, { plan, billingCycle, providerSubscriptionId }) {
  const now = new Date();
  subscription.plan = plan;
  subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
  subscription.billingCycle = billingCycle;
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = addInterval(now, billingCycle);
  subscription.cancelAtPeriodEnd = false;
  if (providerSubscriptionId) {
    subscription.paymentProviderSubscriptionId = providerSubscriptionId;
  }
}

/**
 * Single entry point for every payment-provider webhook, whether it
 * arrived as a real signed HTTP webhook (payment.controller.js) or a dev
 * simulation (same controller's simulateDevCheckout, local dev only) —
 * both paths converge here so subscription-state changes only ever happen
 * one way, with idempotency enforced identically for either origin.
 *
 * Idempotency (SRS "Implement webhook idempotency"): providers guarantee
 * at-least-once delivery, so the same event can arrive more than once.
 * WebhookEvent.providerEventId has a unique index — a duplicate insert
 * throws (code 11000), which this function treats as "already handled,
 * nothing to do" rather than an error.
 */
export async function handleWebhookEvent(event) {
  let webhookEvent;
  try {
    webhookEvent = await WebhookEvent.create({
      provider: env.payment.provider,
      providerEventId: event.providerEventId,
      type: event.type,
      summary: event.data,
    });
  } catch (err) {
    if (err.code === 11000) {
      logger.info(`Webhook event ${event.providerEventId} already processed — skipping`);
      return;
    }
    throw err;
  }

  try {
    await processWebhookEvent(event);
    webhookEvent.status = WEBHOOK_EVENT_STATUS.PROCESSED;
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();
  } catch (err) {
    webhookEvent.status = WEBHOOK_EVENT_STATUS.FAILED;
    webhookEvent.error = err.message;
    await webhookEvent.save();
    // Re-thrown so the caller (payment.controller.js) can decide the HTTP
    // response — a real infra error here (e.g. Mongo briefly unreachable)
    // should surface as non-2xx so the provider retries; a business-logic
    // mismatch (unknown user, already-cancelled subscription) is still
    // logged and recorded above either way.
    throw err;
  }
}

async function processWebhookEvent(event) {
  const { data } = event;

  switch (event.type) {
    // Razorpay: successful payment (covers both webhook and verify endpoint)
    case 'payment.captured':
    case 'payment.authorized': {
      const payment = await Payment.findOneAndUpdate(
        { providerSessionId: data.providerOrderId },
        { status: PAYMENT_STATUS.SUCCEEDED, providerPaymentId: data.providerPaymentId },
        { new: true }
      );
      if (!payment && !data.userId) {
        logger.warn(`${event.type} for unknown order ${data.providerOrderId}`);
        return;
      }
      const userId = data.userId || payment?.user;
      if (!userId) {
        logger.warn(`${event.type}: no userId found for order ${data.providerOrderId}`);
        return;
      }
      const subscription = await getOrCreateSubscription(userId);
      applyPlanToSubscription(subscription, {
        plan: data.planId,
        billingCycle: data.billingCycle || 'monthly',
        providerSubscriptionId: data.providerSubscriptionId || null,
      });
      await subscription.save();
      break;
    }

    // Razorpay: payment failed
    case 'payment.failed': {
      const failedPayment = await Payment.findOneAndUpdate(
        { providerSessionId: data.providerOrderId },
        { status: PAYMENT_STATUS.FAILED },
        { new: true }
      );
      if (failedPayment) {
        await Payment.create({
          user: failedPayment.user,
          amount: 0,
          provider: env.payment.provider,
          status: PAYMENT_STATUS.FAILED,
        });
      }
      break;
    }

    // Razorpay: subscription lifecycle events
    case 'subscription.activated':
    case 'subscription.charged': {
      const sub = await Subscription.findOne({
        paymentProviderSubscriptionId: data.providerSubscriptionId,
      });
      if (sub) {
        applyPlanToSubscription(sub, {
          plan: data.planId || sub.plan,
          billingCycle: data.billingCycle || sub.billingCycle,
          providerSubscriptionId: data.providerSubscriptionId,
        });
        await sub.save();
      } else if (data.userId) {
        const newSub = await getOrCreateSubscription(data.userId);
        applyPlanToSubscription(newSub, {
          plan: data.planId,
          billingCycle: data.billingCycle || 'monthly',
          providerSubscriptionId: data.providerSubscriptionId,
        });
        await newSub.save();
      }
      break;
    }

    case 'subscription.cancelled':
    case 'subscription.halted': {
      const sub = await Subscription.findOne({
        paymentProviderSubscriptionId: data.providerSubscriptionId,
      });
      if (!sub) return;
      sub.status = SUBSCRIPTION_STATUS.CANCELLED;
      sub.plan = SUBSCRIPTION_PLANS.FREE;
      await sub.save();
      break;
    }

    case 'subscription.completed': {
      const sub = await Subscription.findOne({
        paymentProviderSubscriptionId: data.providerSubscriptionId,
      });
      if (!sub) return;
      sub.status = SUBSCRIPTION_STATUS.CANCELLED;
      sub.plan = SUBSCRIPTION_PLANS.FREE;
      await sub.save();
      break;
    }

    // Stripe-style events (kept for backward compatibility)
    case 'checkout.session.completed': {
      const payment = await Payment.findOneAndUpdate(
        { providerSessionId: data.providerSessionId },
        { status: PAYMENT_STATUS.SUCCEEDED, providerPaymentId: data.providerSubscriptionId },
        { new: true }
      );
      if (!payment) {
        logger.warn(`checkout.session.completed for unknown session ${data.providerSessionId}`);
        return;
      }
      const subscription = await getOrCreateSubscription(payment.user);
      applyPlanToSubscription(subscription, {
        plan: data.planId,
        billingCycle: data.billingCycle,
        providerSubscriptionId: data.providerSubscriptionId,
      });
      await subscription.save();
      break;
    }

    case 'invoice.payment_failed': {
      const subscription = await Subscription.findOne({
        paymentProviderSubscriptionId: data.providerSubscriptionId,
      });
      if (!subscription) {
        logger.warn(`invoice.payment_failed for unknown subscription ${data.providerSubscriptionId}`);
        return;
      }
      subscription.status = SUBSCRIPTION_STATUS.PAST_DUE;
      await subscription.save();
      await Payment.create({
        user: subscription.user,
        subscription: subscription._id,
        amount: 0, // exact failed amount isn't in the normalized event; provider dashboard has the detail
        provider: env.payment.provider,
        status: PAYMENT_STATUS.FAILED,
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = await Subscription.findOne({
        paymentProviderSubscriptionId: data.providerSubscriptionId,
      });
      if (!subscription) return;
      subscription.status = SUBSCRIPTION_STATUS.CANCELLED;
      subscription.plan = SUBSCRIPTION_PLANS.FREE;
      await subscription.save();
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = await Subscription.findOne({
        paymentProviderSubscriptionId: data.providerSubscriptionId,
      });
      if (!subscription) return;
      subscription.cancelAtPeriodEnd = Boolean(data.cancelAtPeriodEnd);
      if (data.status === 'past_due') subscription.status = SUBSCRIPTION_STATUS.PAST_DUE;
      else if (data.status === 'active') subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
      await subscription.save();
      break;
    }

    // Razorpay: refund events
    case 'refund.created':
    case 'refund.processed': {
      logger.info(`Refund event received: ${event.type}`, {
        paymentId: data.providerPaymentId,
        amount: data.amount,
      });
      break;
    }

    default:
      logger.info(`Unhandled webhook event type: ${event.type}`);
  }
}

/**
 * Cancellation takes effect at the end of the current billing period —
 * the standard SaaS pattern (access already paid for isn't revoked
 * immediately). Mirrors the request to the real provider too (for a paid
 * plan with a live provider subscription) so it doesn't auto-renew there
 * even if this app never processes another webhook for it.
 */
export async function cancelSubscription(userId) {
  const subscription = await getOrCreateSubscription(userId);
  if (subscription.plan === SUBSCRIPTION_PLANS.FREE) {
    throw ApiError.badRequest('The Free plan cannot be cancelled');
  }
  if (subscription.paymentProviderSubscriptionId) {
    await getPaymentProvider().cancelSubscription(subscription.paymentProviderSubscriptionId);
  }
  subscription.cancelAtPeriodEnd = true;
  await subscription.save();
  return subscription;
}

export async function reactivateSubscription(userId) {
  const subscription = await getOrCreateSubscription(userId);
  if (subscription.paymentProviderSubscriptionId) {
    await getPaymentProvider().reactivateSubscription(subscription.paymentProviderSubscriptionId);
  }
  subscription.cancelAtPeriodEnd = false;
  await subscription.save();
  return subscription;
}

export async function listMyPayments(userId) {
  return Payment.find({ user: userId }).sort({ createdAt: -1 }).limit(50);
}
