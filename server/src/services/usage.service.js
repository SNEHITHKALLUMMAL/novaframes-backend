import { Usage } from '../models/Usage.model.js';
import { getOrCreateSubscription } from './subscription.service.js';
import { getPlanDefinition } from '../constants/plans.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Returns the user's current subscription plan, billing period, and
 * live usage count for that period. This is the single place fair-use
 * enforcement reads from — generation.service.js calls checkAndReserveQuota
 * before creating a job; nothing else duplicates this logic.
 */
export async function getMyUsage(userId) {
  const subscription = await getOrCreateSubscription(userId);
  const planDefinition = getPlanDefinition(subscription.plan);

  const usage = await Usage.findOne({
    user: userId,
    periodStart: subscription.currentPeriodStart,
  });

  return {
    plan: planDefinition,
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    generationsUsed: usage?.generationsCount ?? 0,
    generationsLimit: planDefinition.generationsPerMonth, // null = unlimited
  };
}

/**
 * Called by generation.service.js before a job is created. Throws if the
 * plan's monthly cap is already reached — a null generationsPerMonth
 * (Unlimited plan) always passes this check, but the caller (and the
 * worker) still enforce global concurrency/queue limits regardless, so
 * "unlimited" never means unlimited simultaneous GPU jobs.
 */
export async function assertWithinQuota(userId) {
  const { plan, generationsUsed, generationsLimit } = await getMyUsage(userId);
  if (generationsLimit !== null && generationsUsed >= generationsLimit) {
    throw ApiError.forbidden(
      `You've used all ${generationsLimit} generations included in your ${plan.name} plan this period. ` +
        `Upgrade your plan or wait for the next billing period.`
    );
  }
}

/**
 * Atomic increment ($inc + upsert) rather than read-modify-write, so
 * concurrent job submissions can't undercount usage under a race — the
 * exact design decision documented back in Phase 4's DATA_MODEL.md.
 */
export async function recordGeneration(userId) {
  const subscription = await getOrCreateSubscription(userId);
  await Usage.findOneAndUpdate(
    { user: userId, periodStart: subscription.currentPeriodStart },
    {
      $inc: { generationsCount: 1 },
      $setOnInsert: { periodEnd: subscription.currentPeriodEnd },
    },
    { upsert: true }
  );
}
