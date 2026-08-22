import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { AIModel } from '../src/models/AIModel.model.js';
import { GENERATION_TYPES } from '../src/constants/enums.js';
import { logger } from '../src/utils/logger.js';

/**
 * Run with: npm --prefix server run seed:mock-model
 * Idempotent — safe to run multiple times (upserts by modelId).
 */
async function main() {
  await connectDatabase();

  const doc = await AIModel.findOneAndUpdate(
    { modelId: 'mock-dev-v1' },
    {
      modelId: 'mock-dev-v1',
      name: 'Development Mock Model',
      provider: 'internal',
      description:
        'Non-AI development/test adapter. Produces a clearly labeled placeholder video via ' +
        'ffmpeg to exercise the full generation pipeline without a GPU. Never real AI output.',
      capabilities: Object.values(GENERATION_TYPES),
      supportedResolutions: ['1280x720', '854x480'],
      supportedDurationsSeconds: [2, 3, 5, 8, 10],
      vramRequirementGB: 0,
      license: 'N/A — internal development tool, not a distributable model',
      commercialUseAllowed: false,
      isEnabled: true,
      isDefault: true,
      adapterKey: 'mock',
      config: {},
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info('Seeded mock AIModel', { id: doc._id.toString(), modelId: doc.modelId });
  await disconnectDatabase();
}

main().catch((err) => {
  logger.error('Seed failed', { error: err.message });
  process.exit(1);
});
