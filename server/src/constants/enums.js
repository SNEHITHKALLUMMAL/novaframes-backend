/**
 * Single source of truth for enum-like string values used across models,
 * services, and eventually the ai-worker and client (via shared/ in a later
 * phase). Prevents magic strings drifting out of sync between a schema's
 * `enum: [...]` and the code that checks against it.
 */

// Deliberately three roles, not the four (user/premium_user/admin/
// super_admin) an early planning doc floated — "premium" isn't a role
// here, it's a Subscription.plan (see constants/plans.js), already fully
// implemented as the single source of truth for what a user's plan grants.
// Adding a parallel `premium_user` role would create two places that could
// disagree about whether a user is "premium" (their role vs. their actual
// subscription state) — a real correctness risk for no benefit, since
// every plan-gated check already reads the subscription. See
// docs/AUTHORIZATION.md.
export const USER_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
});

export const GENERATION_TYPES = Object.freeze({
  TEXT_TO_VIDEO: 'text-to-video',
  IMAGE_TO_VIDEO: 'image-to-video',
  TEXT_IMAGE_TO_VIDEO: 'text-image-to-video',
});

export const JOB_STATUS = Object.freeze({
  PENDING: 'PENDING',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  // Distinct from PROCESSING (SRS PHASE_09) — a job between BullMQ retry
  // attempts (in exponential backoff, not yet re-picked-up by a worker).
  // Found during the PHASE_08/09 audit that this had no visible state at
  // all: worker.js only touched Mongo on the FINAL failed attempt, so
  // during retries 1-2 of 3 the record silently sat at whatever status
  // it last had (usually still PROCESSING) while actually waiting in
  // backoff — not wrong, but not honest about what was happening either.
  RETRYING: 'RETRYING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  // Distinct from FAILED (SRS PHASE_09) — specifically when the job
  // exceeded env.resourceLimits.jobTimeoutMs (worker.js's
  // GenerationTimeoutError, which already tagged `code: 'TIMEOUT'`
  // internally but the job's own `status` still just said generic
  // FAILED — found during this audit). Distinguishing lets the frontend/
  // admin dashboard show "Timed out" rather than an undifferentiated
  // "Failed", and lets future retry-policy logic treat timeouts
  // differently from e.g. an adapter validation error if that's ever
  // warranted.
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
});

export const VIDEO_STATUS = Object.freeze({
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
});

export const SUBSCRIPTION_PLANS = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
  UNLIMITED: 'unlimited',
});

export const SUBSCRIPTION_STATUS = Object.freeze({
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  PAST_DUE: 'past_due',
});

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

export const WEBHOOK_EVENT_STATUS = Object.freeze({
  RECEIVED: 'received',
  PROCESSED: 'processed',
  FAILED: 'failed',
});

export const NOTIFICATION_TYPES = Object.freeze({
  JOB_COMPLETED: 'job_completed',
  JOB_FAILED: 'job_failed',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  SYSTEM: 'system',
});

export const UPLOADED_FILE_PURPOSE = Object.freeze({
  GENERATION_INPUT: 'generation-input',
  AVATAR: 'avatar',
  OTHER: 'other',
});
