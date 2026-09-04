import { AIModel } from '../../models/AIModel.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { writeAuditLog } from '../adminAuditLog.service.js';
import { listRegisteredAdapterKeys } from '../adapters/adapterRegistry.js';

export async function listAllModels() {
  return AIModel.find().sort({ isDefault: -1, name: 1 });
}

const EDITABLE_FIELDS = [
  'name',
  'provider',
  'description',
  'capabilities',
  'supportedResolutions',
  'supportedDurationsSeconds',
  'vramRequirementGB',
  'license',
  'commercialUseAllowed',
  'adapterKey',
  'config',
  'isEnabled',
  'isDefault',
];

/**
 * Full create — the Phase 20 addition on top of Phase 19's enable/disable
 * toggle. modelId is checked against Mongo's own unique index (AIModel
 * schema) rather than a separate pre-check, since a race between two
 * concurrent creates would still be caught by the database constraint.
 */
export async function createModel(actorId, data) {
  const model = await AIModel.create(data);

  await writeAuditLog({
    actorId,
    action: 'ai_model.created',
    targetType: 'AIModel',
    targetId: model._id,
    metadata: { modelId: model.modelId, adapterKey: model.adapterKey },
  });

  return model;
}

/**
 * Handles both the Phase 19 quick-toggle case (isEnabled/isDefault only)
 * and full-record edits — same function, since the audit-log diffing logic
 * is identical either way; only the set of changed fields differs.
 */
export async function updateModel(actorId, modelId, updates) {
  const model = await AIModel.findById(modelId);
  if (!model) throw ApiError.notFound('Model not found');

  const changes = {};
  for (const field of EDITABLE_FIELDS) {
    if (updates[field] === undefined) continue;
    const from = model[field];
    model[field] = updates[field];
    changes[field] = { from, to: updates[field] };
  }

  if (updates.isDefault === true) {
    // Only one default model at a time — clear the flag on every other model.
    await AIModel.updateMany({ _id: { $ne: model._id } }, { $set: { isDefault: false } });
  }

  await model.save();

  await writeAuditLog({
    actorId,
    action: 'ai_model.updated',
    targetType: 'AIModel',
    targetId: model._id,
    metadata: changes,
  });

  return model;
}

export async function deleteModel(actorId, modelId) {
  const model = await AIModel.findById(modelId);
  if (!model) throw ApiError.notFound('Model not found');

  if (model.isDefault) {
    throw ApiError.badRequest('Cannot delete the default model — set another model as default first');
  }

  await AIModel.deleteOne({ _id: model._id });

  // Historical GenerationJob/Video documents keep their aiModel reference
  // as-is (an orphaned ObjectId) rather than being rewritten or deleted —
  // this preserves generation history; population of a deleted model
  // simply returns null, which the UI already handles ("Unknown model").

  await writeAuditLog({
    actorId,
    action: 'ai_model.deleted',
    targetType: 'AIModel',
    targetId: model._id,
    metadata: { modelId: model.modelId },
  });

  return { deleted: true };
}

/**
 * Surfaced in the admin UI so an admin creating a new AIModel row knows
 * which adapterKey values will actually resolve to a working adapter at
 * generation time, rather than guessing — 'wan' only appears here when
 * WAN_ADAPTER_ENABLED=true, since it isn't registered otherwise (Phase 12).
 */
export function getAvailableAdapterKeys() {
  return listRegisteredAdapterKeys();
}
