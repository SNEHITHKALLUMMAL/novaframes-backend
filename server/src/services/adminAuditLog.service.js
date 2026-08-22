import { AuditLog } from '../models/AuditLog.model.js';

/**
 * The AuditLog model has existed since Phase 4 but nothing wrote to it
 * until now — admin actions (role changes, activation toggles, model
 * enable/disable, moderation deletes) are the first real source of audit
 * entries. Call this from the admin service functions that perform a
 * state-changing action, not from read-only list/get endpoints.
 */
export async function writeAuditLog({ actorId, action, targetType, targetId, metadata, ipAddress }) {
  await AuditLog.create({
    actor: actorId,
    action,
    targetType: targetType ?? null,
    targetId: targetId ?? null,
    metadata: metadata ?? {},
    ipAddress: ipAddress ?? null,
  });
}

export async function listAuditLogs({ page, limit }) {
  const [logs, total] = await Promise.all([
    AuditLog.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actor', 'name email')
      .lean(),
    AuditLog.countDocuments(),
  ]);
  return { logs, total, page, limit };
}
