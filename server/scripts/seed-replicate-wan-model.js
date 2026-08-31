import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { AIModel } from '../src/models/AIModel.model.js';
import { GENERATION_TYPES } from '../src/constants/enums.js';
import { logger } from '../src/utils/logger.js';

/**
 * Run with: npm --prefix server run seed:replicate-wan-model
 * Idempotent — safe to run multiple times (upserts by modelId).
 *
 * Seeds the Replicate-hosted Wan 2.2 model. Requires REPLICATE_API_TOKEN
 * and VIDEO_MODEL_PROVIDER=replicate in the environment — this script only
 * creates the AIModel row; the actual Replicate adapter registration happens
 * at server startup via registerAllAdapters.js.
 */
async function main() {
  await connectDatabase();

  // Clear isDefault on any model that currently holds it, so the new
  // model becomes the single default (same pattern as the mock seed).
  await AIModel.updateMany({ isDefault: true }, { $set: { isDefault: false } });

  const doc = await AIModel.findOneAndUpdate(
    { modelId: 'replicate-wan-2.2' },
    {
      modelId: 'replicate-wan-2.2',
      name: 'Wan 2.2 (Replicate)',
      provider: 'Replicate / Alibaba',
      description:
        'Cloud-hosted Wan 2.2 text-to-video and image-to-video model via Replicate. ' +
        'No local GPU required — generation runs on Replicate\'s infrastructure. ' +
        'Requires VIDEO_MODEL_PROVIDER=replicate and a valid REPLICATE_API_TOKEN.',
      capabilities: [
        GENERATION_TYPES.TEXT_TO_VIDEO,
        GENERATION_TYPES.IMAGE_TO_VIDEO,
        GENERATION_TYPES.TEXT_IMAGE_TO_VIDEO,
      ],
      supportedResolutions: ['1280x720', '854x480'],
      supportedDurationsSeconds: [2, 3, 5],
      vramRequirementGB: 0, // cloud-hosted — no local GPU needed
      license: 'Apache 2.0 (model) + Replicate terms',
      commercialUseAllowed: true,
      isEnabled: true,
      isDefault: true,
      adapterKey: 'replicate-wan',
      config: {},
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info('Seeded Replicate Wan 2.2 AIModel', {
    id: doc._id.toString(),
    modelId: doc.modelId,
    adapterKey: doc.adapterKey,
    isEnabled: doc.isEnabled,
    isDefault: doc.isDefault,
  });

  await disconnectDatabase();
}

main().catch((err) => {
  logger.error('Seed failed', { error: err.message });
  process.exit(1);
});
