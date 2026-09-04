import { ModelVersion } from '../../models/ModelVersion.model.js';
import { AIModel } from '../../models/AIModel.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { writeAuditLog } from '../adminAuditLog.service.js';

export async function listVersions(modelId) {
  const model = await AIModel.findById(modelId);
  if (!model) throw ApiError.notFound('Model not found');
  return ModelVersion.find({ aiModel: modelId }).sort({ createdAt: -1 });
}

export async function createVersion(actorId, modelId, { version, releaseNotes }) {
  const model = await AIModel.findById(modelId);
  if (!model) throw ApiError.notFound('Model not found');

  const existing = await ModelVersion.findOne({ aiModel: modelId, version });
  if (existing) {
    throw ApiError.conflict(`Version "${version}" already exists for this model`);
  }

  const modelVersion = await ModelVersion.create({
    aiModel: modelId,
    version,
    releaseNotes,
    isActive: true,
  });

  await writeAuditLog({
    actorId,
    action: 'ai_model_version.created',
    targetType: 'ModelVersion',
    targetId: modelVersion._id,
    metadata: { modelId: model.modelId, version },
  });

  return modelVersion;
}

export async function deleteVersion(actorId, versionId) {
  const modelVersion = await ModelVersion.findById(versionId);
  if (!modelVersion) throw ApiError.notFound('Model version not found');

  await ModelVersion.deleteOne({ _id: modelVersion._id });

  await writeAuditLog({
    actorId,
    action: 'ai_model_version.deleted',
    targetType: 'ModelVersion',
    targetId: modelVersion._id,
    metadata: { version: modelVersion.version },
  });

  return { deleted: true };
}
