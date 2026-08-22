/**
 * Single source of truth for enum-like string values used across models,
 * services, and eventually the ai-worker and client (via shared/ in a later
 * phase). Prevents magic strings drifting out of sync between a schema's
 * `enum: [...]` and the code that checks against it.
 */

export const USER_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
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
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
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
