import { Subscription } from '../models/Subscription.model.js';
import { Payment } from '../models/Payment.model.js';
import { getPlanDefinition } from '../constants/plans.js';
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUS, PAYMENT_STATUS } from '../constants/enums.js';
import { getPaymentProvider } from './payments/index.js';
import { ApiError } from '../utils/ApiError.js';
import { addInterval } from '../utils/dateMath.js';

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
 * Upgrading/changing plans goes through the PaymentProvider abstraction —
 * this function never sees card details, only ever the provider's opaque
 * confirmation (SRS payment security rules). A Payment record is created
 * regardless of outcome, so failed attempts are visible in billing history
 * too, not just successes.
 */
export async function subscribeToPlan(userId, { plan, billingCycle }) {
  const planDefinition = getPlanDefinition(plan);
  const amountCents =
    billingCycle === 'yearly' ? planDefinition.priceYearlyCents : planDefinition.priceMonthlyCents;

  const subscription = await getOrCreateSubscription(userId);

  let chargeResult = { status: PAYMENT_STATUS.SUCCEEDED, providerPaymentId: null, providerSubscriptionId: null };
  if (amountCents > 0) {
    const provider = getPaymentProvider();
    try {
      chargeResult = await provider.charge({
        userId: userId.toString(),
        planId: plan,
        billingCycle,
        amountCents,
      });
    } catch (err) {
      await Payment.create({
        user: userId,
        subscription: subscription._id,
        amount: amountCents,
        provider: 'dev-stub',
        status: PAYMENT_STATUS.FAILED,
      });
      throw ApiError.badRequest(`Payment failed: ${err.message}`);
    }
  }

  await Payment.create({
    user: userId,
    subscription: subscription._id,
    amount: amountCents,
    provider: 'dev-stub',
    status: chargeResult.status === 'succeeded' ? PAYMENT_STATUS.SUCCEEDED : PAYMENT_STATUS.FAILED,
    providerPaymentId: chargeResult.providerPaymentId,
  });

  if (chargeResult.status !== 'succeeded') {
    throw ApiError.badRequest('Payment was not successful');
  }

  const now = new Date();
  subscription.plan = plan;
  subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
  subscription.billingCycle = billingCycle;
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = addInterval(now, billingCycle);
  subscription.cancelAtPeriodEnd = false;
  subscription.paymentProviderSubscriptionId = chargeResult.providerSubscriptionId;
  await subscription.save();

  return subscription;
}

/**
 * Cancellation takes effect at the end of the current billing period —
 * the standard SaaS pattern (access already paid for isn't revoked
 * immediately). Reactivating before the period ends just clears the flag.
 */
export async function cancelSubscription(userId) {
  const subscription = await getOrCreateSubscription(userId);
  if (subscription.plan === SUBSCRIPTION_PLANS.FREE) {
    throw ApiError.badRequest('The Free plan cannot be cancelled');
  }
  subscription.cancelAtPeriodEnd = true;
  await subscription.save();
  return subscription;
}

export async function reactivateSubscription(userId) {
  const subscription = await getOrCreateSubscription(userId);
  subscription.cancelAtPeriodEnd = false;
  await subscription.save();
  return subscription;
}

export async function listMyPayments(userId) {
  return Payment.find({ user: userId }).sort({ createdAt: -1 }).limit(50);
}
