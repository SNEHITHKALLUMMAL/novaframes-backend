import { registerAdapter } from './adapterRegistry.js';
import { DevelopmentMockAdapter } from './mock/DevelopmentMockAdapter.js';
import { WanAdapter } from './wan/WanAdapter.js';
import { ReplicateWanAdapter } from './replicate/ReplicateWanAdapter.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Called once at worker startup. The mock adapter always registers — it has
 * no external dependencies and needs to be available in any environment.
 * WanAdapter only registers when WAN_ADAPTER_ENABLED=true, since it requires
 * a real Python/CUDA environment and downloaded model weights (see
 * ai-worker/README.md) that most environments — including this project's
 * own local dev machine per Phase 1's hardware notes — won't have. Leaving
 * it unregistered by default means AIModel rows pointing at adapterKey:
 * 'wan' fail clearly with ADAPTER_NOT_REGISTERED rather than the worker
 * crashing at startup trying to use a GPU that isn't there.
 *
 * ReplicateWanAdapter registers when VIDEO_MODEL_PROVIDER=replicate and
 * REPLICATE_API_TOKEN is set. It uses the Replicate cloud API — no GPU,
 * no Python, no local model weights required.
 */
export function registerAllAdapters() {
  registerAdapter('mock', new DevelopmentMockAdapter());

  if (env.wanAdapter.enabled) {
    registerAdapter('wan', new WanAdapter());
    logger.info('Wan adapter registered (WAN_ADAPTER_ENABLED=true)');
  } else {
    logger.info('Wan adapter NOT registered (WAN_ADAPTER_ENABLED is not "true")');
  }

  if (env.replicate.videoModelProvider === 'replicate' && env.replicate.apiToken) {
    registerAdapter('replicate-wan', new ReplicateWanAdapter());
    logger.info('Replicate Wan adapter registered (VIDEO_MODEL_PROVIDER=replicate)', {
      t2vModel: env.replicate.t2vModel,
      i2vModel: env.replicate.i2vModel,
    });
  } else {
    logger.info('Replicate Wan adapter NOT registered (VIDEO_MODEL_PROVIDER is not "replicate" or REPLICATE_API_TOKEN missing)');
  }
}
