import { User } from '../models/User.model.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './token.service.js';

// Account lockout thresholds (SRS security_hardening — brute-force
// protection). Kept as constants here rather than env vars since these
// are a security policy decision, not deployment-environment config.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function registerUser({ name, email, password }) {
  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = await User.create({ name, email, password });
  return issueTokenPair(user);
}

export async function loginUser({ email, password }) {
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

  return issueTokenPair(user);
}

export async function refreshSession(refreshToken) {
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

  // tokenVersion mismatch means the password changed (or logout-everywhere
  // was triggered) since this refresh token was issued — reject it.
  if (user.tokenVersion !== payload.tokenVersion) {
    throw ApiError.unauthorized('Session has been invalidated, please log in again');
  }

  return issueTokenPair(user);
}

function issueTokenPair(user) {
  return {
    user,
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}
