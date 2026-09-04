/**
 * Runtime registry the worker consults to turn an AIModel.adapterKey into an
 * actual adapter implementation. Empty by design in Phase 9 — no adapter
 * exists yet. Phase 10 registers 'mock' (DevelopmentMockAdapter); Phase 12
 * registers real model adapters (e.g. 'wan', 'ltx-video') alongside it.
 *
 * Every adapter must implement the common interface documented in
 * BaseVideoModel's contract (added in Phase 10): load(), validateInput(),
 * generate(), cancel(), cleanup(), getCapabilities().
 */
const registry = new Map();

export function registerAdapter(key, adapter) {
  registry.set(key, adapter);
}

export function getAdapter(key) {
  const adapter = registry.get(key);
  if (!adapter) {
    const err = new Error(
      `No AI adapter registered for key "${key}". This model cannot be run yet — ` +
        `real generation adapters are added starting Phase 10.`
    );
    err.code = 'ADAPTER_NOT_REGISTERED';
    throw err;
  }
  return adapter;
}

export function listRegisteredAdapterKeys() {
  return Array.from(registry.keys());
}
