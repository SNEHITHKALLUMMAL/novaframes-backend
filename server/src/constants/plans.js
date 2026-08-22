import { SUBSCRIPTION_PLANS } from './enums.js';

/**
 * Single source of truth for what each plan actually grants. Both the
 * pricing UI and the fair-use enforcement in generation.service.js read
 * from this — a plan's limits are never duplicated or hard-coded at the
 * call site.
 *
 * generationsPerMonth: null means "unlimited job count" — but per the SRS's
 * explicit warning, "unlimited" only removes the monthly quota. It does
 * NOT bypass the global MAX_CONCURRENT_JOBS/MAX_QUEUE_SIZE limits from
 * Phase 9, which apply identically regardless of plan. Nobody gets
 * unlimited simultaneous GPU jobs.
 */
export const PLAN_DEFINITIONS = {
  [SUBSCRIPTION_PLANS.FREE]: {
    id: SUBSCRIPTION_PLANS.FREE,
    name: 'Free',
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    generationsPerMonth: 5,
    maxDurationSeconds: 5,
    maxResolution: '854x480',
    description: 'Try the platform with a handful of generations a month.',
  },
  [SUBSCRIPTION_PLANS.PRO]: {
    id: SUBSCRIPTION_PLANS.PRO,
    name: 'Pro',
    priceMonthlyCents: 1900,
    priceYearlyCents: 19000, // ~2 months free on annual billing
    generationsPerMonth: 100,
    maxDurationSeconds: 10,
    maxResolution: '1280x720',
    description: 'For regular creators — higher caps and longer clips.',
  },
  [SUBSCRIPTION_PLANS.UNLIMITED]: {
    id: SUBSCRIPTION_PLANS.UNLIMITED,
    name: 'Unlimited',
    priceMonthlyCents: 4900,
    priceYearlyCents: 49000,
    generationsPerMonth: null, // no monthly cap — concurrency limits still apply globally
    maxDurationSeconds: 10,
    maxResolution: '1280x720',
    description: 'No monthly generation cap. Subject to fair-use queue limits.',
  },
};

export function getPlanDefinition(planId) {
  return PLAN_DEFINITIONS[planId] ?? PLAN_DEFINITIONS[SUBSCRIPTION_PLANS.FREE];
}

export function listPlanDefinitions() {
  return Object.values(PLAN_DEFINITIONS);
}
