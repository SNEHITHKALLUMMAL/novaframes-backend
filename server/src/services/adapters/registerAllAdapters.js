import { registerAdapter } from './adapterRegistry.js';
import { DevelopmentMockAdapter } from './mock/DevelopmentMockAdapter.js';
import { WanAdapter } from './wan/WanAdapter.js';
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
 */
export function registerAllAdapters() {
  registerAdapter('mock', new DevelopmentMockAdapter());

  if (env.wanAdapter.enabled) {
    registerAdapter('wan', new WanAdapter());
    logger.info('Wan adapter registered (WAN_ADAPTER_ENABLED=true)');
  } else {
    logger.info('Wan adapter NOT registered (WAN_ADAPTER_ENABLED is not "true")');
  }
}
