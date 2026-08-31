import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { AIModel } from '../src/models/AIModel.model.js';
import { logger } from '../src/utils/logger.js';

/**
 * Run with: npm --prefix server run seed:wan-model
 * Idempotent — safe to run multiple times (upserts by modelId).
 *
 * Creates the AIModel row with isEnabled: false. Flip it to true (via the
 * database directly, or the admin model-management UI once Phase 20 builds
 * it) only after confirming WanAdapter actually works against your real
 * GPU environment — see ai-worker/README.md. Submitting a job against an
 * enabled-but-non-functional Wan row will fail loudly (ADAPTER_NOT_CONFIGURED
 * or a Python traceback surfaced as the job's error), not silently.
 */
async function main() {
  await connectDatabase();

  const doc = await AIModel.findOneAndUpdate(
    { modelId: 'wan-2.2' },
    {
      modelId: 'wan-2.2',
      name: 'Wan 2.2',
      provider: 'Alibaba',
      description:
        'Open-weights text-to-video and image-to-video model. See docs/AI_MODEL_SELECTION.md ' +
        'for the license/hardware research behind this choice. Requires a CUDA GPU and the ' +
        'Python environment set up per ai-worker/README.md — disabled until that is confirmed working.',
      capabilities: ['text-to-video', 'image-to-video'],
      supportedResolutions: ['1280x720', '854x480'],
      supportedDurationsSeconds: [2, 3, 5],
      vramRequirementGB: 8, // conservative floor for the quantized 1.3B/5B tiers — see AI_MODEL_SELECTION.md
      license: 'Apache 2.0',
      commercialUseAllowed: true,
      isEnabled: false, // deliberately off until real hardware confirms it works
      isDefault: false,
      adapterKey: 'wan',
      config: {},
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info('Seeded Wan AIModel (disabled by default)', {
    id: doc._id.toString(),
    modelId: doc.modelId,
    isEnabled: doc.isEnabled,
  });
  await disconnectDatabase();
}

main().catch((err) => {
  logger.error('Seed failed', { error: err.message });
  process.exit(1);
});
