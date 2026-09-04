import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { User } from '../models/User.model.js';
import { Session } from '../models/Session.model.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './token.service.js';
import { getEmailProvider } from './email/index.js';
import { publishAllSessionsRevoked } from '../realtime/sessionEventsPubSub.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Account lockout thresholds (SRS security_hardening — brute-force
// protection). Kept as constants here rather than env vars since these
// are a security policy decision, not deployment-environment config.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes — short-lived on purpose
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function registerUser({ name, email, password }, sessionMeta) {
  const existing = await User.findOne({ email });
  if (existing) {
    // Deliberately NOT enumeration-safe here — see docs/AUTHORIZATION.md's
    // sibling doc docs/SESSIONS.md for the reasoning: registration
    // confirming "this email is taken" is common, broadly-accepted UX
    // (GitHub, most SaaS products do this) and the SRS's "prevent account
    // enumeration where appropriate" is applied where it matters more —
    // requestPasswordReset() below is always enumeration-safe, since a
    // password-reset oracle is the higher-value reconnaissance target for
    // an account-takeover attempt.
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = await User.create({ name, email, password });
  await sendVerificationEmail(user).catch((err) => {
    // Best-effort — a failed verification email must never block
    // registration itself; the user can request a resend.
    logger.warn(`Failed to send verification email to ${email}: ${err.message}`);
  });
  return issueTokenPair(user, sessionMeta);
}

export async function loginUser({ email, password }, sessionMeta) {
  const user = await User.findOne({ email }).select('+password +failedLoginAttempts +lockUntil');
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw ApiError.locked(
      `Too many failed login attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`
    );
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      user.failedLoginAttempts = 0;
    }
    await user.save({ validateBeforeSave: false });
    throw ApiError.unauthorized('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save({ validateBeforeSave: false });

  return issueTokenPair(user, sessionMeta);
}

/**
 * Verifies the refresh token's signature/expiry and tokenVersion (as
 * before), then ALSO checks the Session record matching its jti:
 *  - no Session found → token predates this phase's migration, or was
 *    fabricated; reject.
 *  - Session already revoked → this exact refresh token was already
 *    rotated out (or explicitly logged out) and is being presented again.
 *    That's the textbook signature of a stolen, replayed refresh token —
 *    respond by revoking EVERY session for this user (not just this one),
 *    forcing a fresh login everywhere, same as a detected compromise
 *    should.
 *  - Session active → normal case: rotate (revoke this session, issue a
 *    new token pair backed by a new session).
 */
export async function refreshSession(refreshToken, sessionMeta) {
  if (!refreshToken) throw ApiError.unauthorized('Refresh token missing');

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Account not found or deactivated');
  }

  if (user.tokenVersion !== payload.tokenVersion) {
    throw ApiError.unauthorized('Session has been invalidated, please log in again');
  }

  const session = payload.jti ? await Session.findOne({ jti: payload.jti }) : null;
  if (!session) {
    throw ApiError.unauthorized('Session not found, please log in again');
  }
  if (session.revokedAt) {
    logger.warn(`Refresh token reuse detected for user ${user._id} (jti ${payload.jti}) — revoking all sessions`);
    await Session.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
    await publishAllSessionsRevoked(user._id);
    throw ApiError.unauthorized('Session has been invalidated, please log in again');
  }

  const newPair = await issueTokenPair(user, sessionMeta);
  session.revokedAt = new Date();
  session.replacedByJti = newPair.jti;
  await session.save();

  return newPair;
}

/**
 * Revokes the single session matching the presented refresh token.
 * Idempotent by design — a missing/already-invalid token still "succeeds"
 * (matches the previous cookie-clearing-only behavior's permissiveness;
 * logging out is never itself an error condition worth surfacing).
 */
export async function logoutSession(refreshToken) {
  if (!refreshToken) return;
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return;
  }
  if (payload.jti) {
    await Session.updateOne({ jti: payload.jti, revokedAt: null }, { revokedAt: new Date() });
  }
}

/** "Logout everywhere" — revokes every active session AND bumps
 * tokenVersion (belt-and-suspenders: covers any refresh token that
 * somehow lacks a matching Session, e.g. one issued before this phase). */
export async function logoutAllSessions(userId) {
  await Session.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await publishAllSessionsRevoked(userId);
}

export async function listMySessions(userId) {
  return Session.find({ user: userId, revokedAt: null }).sort({ lastUsedAt: -1 });
}

export async function revokeMySession(userId, sessionId) {
  const result = await Session.updateOne(
    { _id: sessionId, user: userId, revokedAt: null },
    { revokedAt: new Date() }
  );
  if (result.matchedCount === 0) {
    throw ApiError.notFound('Session not found');
  }
}

async function issueTokenPair(user, sessionMeta = {}) {
  const jti = randomUUID();
  await Session.create({
    user: user._id,
    jti,
    userAgent: sessionMeta.userAgent ?? null,
    ip: sessionMeta.ip ?? null,
  });
  return {
    user,
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user, jti),
    jti,
  };
}

// --- Password reset ---

function hashToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Always resolves the same way regardless of whether the email matches an
 * account — the enumeration-safe design the SRS asks for, applied here
 * specifically (see registerUser's comment for why not there too). The
 * caller (auth.controller.js) returns the same generic success message
 * either way; only the actual email send (or lack of one) differs.
 */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email });
  if (!user || !user.isActive) return; // silently no-op — enumeration-safe

  const rawToken = randomBytes(32).toString('hex');
  user.passwordResetTokenHash = hashToken(rawToken);
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${env.frontendUrl}/reset-password?token=${rawToken}`;
  await getEmailProvider().send({
    to: user.email,
    subject: 'Reset your NovaFrame password',
    text: `Reset your password: ${resetUrl}\nThis link expires in 15 minutes. If you didn't request this, ignore this email.`,
    html: `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 15 minutes. If you didn't request this, ignore this email.</p>`,
  });
}

export async function resetPassword(rawToken, newPassword) {
  const tokenHash = hashToken(rawToken);
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select('+password');

  if (!user) {
    throw ApiError.badRequest('Invalid or expired reset link');
  }

  user.password = newPassword; // pre-save hook hashes + bumps tokenVersion
  user.passwordResetTokenHash = null;
  user.passwordResetExpires = null;
  await user.save();

  // A password reset should kill every existing session, not just future
  // token validation (tokenVersion already handles that) — explicitly
  // revoking Session records keeps "list my sessions" accurate too.
  await Session.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
}

// --- Email verification ---
// Non-blocking by design this phase — a user can log in and use the app
// whether or not emailVerified is true. Gating specific features behind
// verification (e.g. requiring it before the first generation) is a
// product decision left to you; see docs/SESSIONS.md.

export async function sendVerificationEmail(user) {
  const rawToken = randomBytes(32).toString('hex');
  user.emailVerificationTokenHash = hashToken(rawToken);
  user.emailVerificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
  await user.save({ validateBeforeSave: false });

  const verifyUrl = `${env.frontendUrl}/verify-email?token=${rawToken}`;
  await getEmailProvider().send({
    to: user.email,
    subject: 'Verify your NovaFrame email',
    text: `Verify your email: ${verifyUrl}\nThis link expires in 24 hours.`,
    html: `<p>Verify your email: <a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function verifyEmail(rawToken) {
  const tokenHash = hashToken(rawToken);
  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationExpires: { $gt: new Date() },
  });

  if (!user) {
    throw ApiError.badRequest('Invalid or expired verification link');
  }

  user.emailVerified = true;
  user.emailVerificationTokenHash = null;
  user.emailVerificationExpires = null;
  await user.save({ validateBeforeSave: false });
}

export async function resendVerificationEmail(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (user.emailVerified) {
    throw ApiError.badRequest('Email is already verified');
  }
  await sendVerificationEmail(user);
}
