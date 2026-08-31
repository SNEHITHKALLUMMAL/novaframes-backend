import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.', errors: [] },
});

export const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts, please try again later.', errors: [] },
});

/**
 * File uploads are more resource-intensive per-request than typical JSON
 * API calls (real disk/bandwidth cost — SRS security hardening: prevent
 * storage-exhaustion abuse), so they get a stricter dedicated limit rather
 * than sharing the general apiLimiter's higher ceiling.
 */
export const uploadLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: Number(process.env.UPLOAD_RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many uploads, please try again later.', errors: [] },
});

/**
 * Separate from the plan-based monthly quota (Phase 18) and the global
 * queue-size cap (Phase 9) — those stop a user once too much *work* has
 * been accepted. This stops rapid-fire *request* flooding of the endpoint
 * itself (e.g. a script hammering POST /generations faster than the quota
 * check alone would discourage), an independent layer of defense.
 */
export const generationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.GENERATION_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many generation requests in a short period, please slow down.',
    errors: [],
  },
});
