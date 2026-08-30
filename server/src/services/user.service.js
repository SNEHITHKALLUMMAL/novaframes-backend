import { User } from '../models/User.model.js';
import { Session } from '../models/Session.model.js';
import { ApiError } from '../utils/ApiError.js';
import { publishAllSessionsRevoked } from '../realtime/sessionEventsPubSub.js';

export async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export async function updateProfile(userId, updates) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw ApiError.notFound('User not found');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw ApiError.unauthorized('Current password is incorrect');

  user.password = newPassword; // pre-save hook hashes + bumps tokenVersion
  await user.save();
  // Explicitly revoke Session records too (PHASE_03) — tokenVersion alone
  // blocks future refresh attempts, but this keeps "list my sessions"
  // accurate immediately rather than only once each session's refresh
  // token is next presented and rejected.
  await Session.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
  await publishAllSessionsRevoked(userId);
  return user;
}

export async function deleteAccount(userId, password) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw ApiError.notFound('User not found');

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw ApiError.unauthorized('Password is incorrect');

  // Soft-delete: deactivate rather than hard-delete the document outright,
  // since GenerationJob/Video/Payment records reference this user and
  // cascading cleanup of storage + billing history is a Phase 18+ concern.
  // A hard-delete/data-purge endpoint can be layered on top of this later
  // without changing the public contract of "delete my account".
  user.isActive = false;
  user.tokenVersion += 1; // invalidate all outstanding sessions immediately
  await user.save({ validateBeforeSave: false });
  await Session.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
  await publishAllSessionsRevoked(userId);
  return user;
}
