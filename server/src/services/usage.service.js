import { UsageLedgerEntry } from '../models/UsageLedgerEntry.model.js';
import { getOrCreateSubscription } from './subscription.service.js';
import { getPlanDefinition } from '../constants/plans.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

/**
 * Sums the ledger for a single period into a net usage count — the only
 * place "how much has this user used this period" is computed. Never
 * reads a cached/mutable counter; this IS the source of truth, derived
 * fresh from the immutable ledger every time. At this scale (one user,
 * one billing period, indexed on {user, periodStart}) this aggregation is
 * cheap — not worth trading correctness for a cache that could drift.
 */
async function sumLedgerForPeriod(userId, periodStart) {
  const result = await UsageLedgerEntry.aggregate([
    { $match: { user: userId, periodStart } },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
      },
    },
  ]);
  const charged = result.find((r) => r._id === 'charge')?.total ?? 0;
  const refunded = result.find((r) => r._id === 'refund')?.total ?? 0;
  return charged - refunded;
}

/**
 * Returns the user's current subscription plan, billing period, and live
 * net usage for that period. This is the single place fair-use
 * enforcement reads from — generation.service.js calls assertWithinQuota
 * before creating a job; nothing else duplicates this logic.
 */
export async function getMyUsage(userId) {
  const subscription = await getOrCreateSubscription(userId);
  const planDefinition = getPlanDefinition(subscription.plan);

  const generationsUsed = await sumLedgerForPeriod(userId, subscription.currentPeriodStart);

  return {
    plan: planDefinition,
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    generationsUsed,
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
 * Records a quota charge for a specific generation job — called once, at
 * submission time (generation.service.js#createGenerationJob), same point
 * the old recordGeneration() fired. Idempotent: the unique
 * (generationJob, type) index means a duplicate call (retry, race) is
 * silently ignored rather than double-charging (SRS: "Prevent double
 * charging"), exactly like WebhookEvent's idempotency in PHASE_13.
 */
export async function chargeGenerationUsage(userId, generationJobId, reason = 'job_submitted', { session } = {}) {
  // Deliberately not passed the transaction's session — a lazily-created
  // Subscription is safe outside strict transactional consistency with
  // the charge (protected independently by its own unique index on
  // `user`, see subscription.service.js), so this read doesn't need to
  // join the caller's transaction. Only the actual financial write
  // (UsageLedgerEntry.create below) needs to be atomic with the
  // GenerationJob it charges for.
  const subscription = await getOrCreateSubscription(userId);
  try {
    await UsageLedgerEntry.create(
      [
        {
          user: userId,
          generationJob: generationJobId,
          type: 'charge',
          amount: 1,
          periodStart: subscription.currentPeriodStart,
          reason,
        },
      ],
      { session }
    );
  } catch (err) {
    if (err.code === 11000) {
      logger.info(`Usage already charged for job ${generationJobId} — skipping duplicate`);
      return;
    }
    throw err;
  }
}

/**
 * Refunds the quota unit a job consumed, when it fails or is cancelled
 * before producing a usable result — the SRS requirement ("Refund credits
 * for qualifying failures") that had no implementation at all before this
 * phase; a failed generation previously consumed the user's quota
 * permanently with no way back. Idempotent the same way charging is —
 * calling this twice for the same job only ever inserts one refund entry.
 *
 * "Qualifying" is deliberately narrow: only FAILED and CANCELLED. A
 * COMPLETED job's charge stands (the user got a video). This function
 * doesn't itself decide which statuses qualify — callers (worker.js's
 * failure handler, generation.service.js#cancelGenerationJob) decide that;
 * this just performs the refund once asked.
 */
export async function refundGenerationUsage(userId, generationJobId, reason) {
  const subscription = await getOrCreateSubscription(userId);
  try {
    await UsageLedgerEntry.create({
      user: userId,
      generationJob: generationJobId,
      type: 'refund',
      amount: 1,
      periodStart: subscription.currentPeriodStart,
      reason,
    });
  } catch (err) {
    if (err.code === 11000) {
      logger.info(`Usage already refunded for job ${generationJobId} — skipping duplicate`);
      return;
    }
    throw err;
  }
}

/**
 * Per-event history for a user — SRS: "Add usage history". Returns raw
 * ledger entries (charges and refunds), most recent first, so a user (or
 * an admin, via listUsageLedgerForUser below) can see exactly which job
 * caused which entry, not just a final number.
 */
export async function getUsageHistory(userId, { limit = 50 } = {}) {
  return UsageLedgerEntry.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('generationJob', 'type status createdAt');
}

/**
 * Admin auditability (SRS: "Add administrative auditability") — same
 * query, callable for any user by an admin. Kept as a separate exported
 * function rather than overloading getUsageHistory with an
 * "isAdmin"-style flag, so the admin code path is explicit at the call
 * site (admin.controller.js) rather than implicit in a shared function's
 * branching.
 */
export async function listUsageLedgerForUser(userId, { limit = 100 } = {}) {
  return UsageLedgerEntry.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('generationJob', 'type status createdAt');
}
