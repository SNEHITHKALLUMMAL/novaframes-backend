import { AIModel } from '../models/AIModel.model.js';

/**
 * Minimal read path: list models available for users to generate against.
 * This is NOT the SRS's full "AI Model Management" feature (create/update/
 * disable/version models, admin-only) — that's Phase 20. This exists now
 * because Phase 13's generation UI genuinely can't function without a way
 * to see which models exist and what they support.
 */
export async function listEnabledModels(type) {
  const filter = { isEnabled: true };
  if (type) filter.capabilities = type;

  return AIModel.find(filter)
    .select('name modelId description capabilities supportedResolutions supportedDurationsSeconds isDefault')
    .sort({ isDefault: -1, name: 1 });
}
