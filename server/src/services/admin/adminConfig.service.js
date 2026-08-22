import { env } from '../../config/env.js';

/**
 * Read-only. Every one of these values is set via environment variables
 * (config/env.js, per the SRS's "do not hard-code these values" rule) and
 * requires a process restart to change — there is no persisted, runtime-
 * editable settings store in this build. Presenting a "Save" button that
 * silently does nothing (or that would need an entirely separate
 * config-override system this build doesn't have) would be the kind of
 * fake functionality the SRS rules out, so this is explicitly a snapshot,
 * not an editor.
 */
export function getSystemConfigSnapshot() {
  return {
    resourceLimits: env.resourceLimits,
    storageProvider: env.storage.provider,
    paymentProvider: env.payment.provider,
    wanAdapterEnabled: env.wanAdapter.enabled,
    nodeEnv: env.nodeEnv,
  };
}
