import { User } from '../../models/User.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { canAssignRole } from '../../utils/roleAuthorization.js';
import { writeAuditLog } from '../adminAuditLog.service.js';

export async function listUsers({ search, role, page, limit }) {
  const filter = {};
  if (role) filter.role = role;
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: re }, { email: re }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(), // read-only admin list; password/lockout fields are select:false at the schema level regardless
    User.countDocuments(filter),
  ]);

  return { users, total, page, limit };
}

export async function setUserRole(actorId, actorRole, userId, role) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const decision = canAssignRole({
    actorId,
    actorRole,
    targetId: userId,
    targetCurrentRole: user.role,
    requestedRole: role,
  });
  if (!decision.allowed) {
    throw ApiError.forbidden(decision.reason);
  }

  const previousRole = user.role;
  user.role = role;
  await user.save({ validateBeforeSave: false });

  await writeAuditLog({
    actorId,
    action: 'user.role_changed',
    targetType: 'User',
    targetId: user._id,
    metadata: { previousRole, newRole: role },
  });

  return user;
}

export async function setUserActive(actorId, userId, isActive) {
  if (actorId.toString() === userId.toString() && !isActive) {
    throw ApiError.badRequest('You cannot deactivate your own account from here');
  }

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  user.isActive = isActive;
  if (!isActive) user.tokenVersion += 1; // invalidate their sessions immediately
  await user.save({ validateBeforeSave: false });

  await writeAuditLog({
    actorId,
    action: isActive ? 'user.activated' : 'user.deactivated',
    targetType: 'User',
    targetId: user._id,
  });

  return user;
}
