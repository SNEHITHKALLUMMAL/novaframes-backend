/**
 * StorageProvider contract. Every backend (LocalStorageProvider,
 * ObjectStorageProvider) implements this shape so the rest of the app
 * never knows which one is active — it's selected once, in
 * getStorageProvider() (./index.js), based on STORAGE_PROVIDER.
 *
 * @typedef {Object} StorageProvider
 * @property {(buffer: Buffer, key: string) => Promise<{ key: string, url: string, sizeBytes: number }>} save
 * @property {(sourcePath: string, key: string) => Promise<{ key: string, url: string, sizeBytes: number }>} saveFile
 * @property {(key: string) => Promise<Buffer>} read
 * @property {(key: string) => Promise<void>} delete
 * @property {(key: string) => string} getUrl - synchronous, "best-effort" reference URL. For LocalStorageProvider this is the real, servable path. For ObjectStorageProvider this is NOT signed/servable on its own — callers that need an actually-fetchable, time-limited URL must use getSignedReadUrl instead. Kept for backward-compat call sites and as a stable identifier, not for direct browser access to private objects.
 * @property {(key: string, expirySeconds?: number) => Promise<string>} [getSignedReadUrl] - optional; only meaningful for backends storing private objects (ObjectStorageProvider). Returns a time-limited, directly-fetchable URL. Callers must generate this per-request rather than persisting it (a persisted signed URL will expire).
 * @property {(key: string) => Promise<string>} [getLocalCopy] - optional; downloads the object to a local temp file and returns its path, for backends (like the Wan GPU adapter) that need to hand a real filesystem path to ffmpeg/Python. LocalStorageProvider doesn't need this (its files are already local — use getAbsolutePath); ObjectStorageProvider implements it.
 */

export class NotImplementedStorageError extends Error {
  constructor(method) {
    super(`StorageProvider.${method}() is not implemented by this backend`);
    this.name = 'NotImplementedStorageError';
  }
}
