/**
 * StorageProvider contract. Every backend (LocalStorageProvider now,
 * an S3-compatible provider in production) implements this shape so the
 * rest of the app never knows which one is active — it's selected once,
 * in getStorageProvider() (./index.js), based on STORAGE_PROVIDER.
 *
 * @typedef {Object} StorageProvider
 * @property {(buffer: Buffer, key: string) => Promise<{ key: string, url: string, sizeBytes: number }>} save
 * @property {(key: string) => Promise<Buffer>} read
 * @property {(key: string) => Promise<void>} delete
 * @property {(key: string) => string} getUrl
 */

export class NotImplementedStorageError extends Error {
  constructor(method) {
    super(`StorageProvider.${method}() is not implemented by this backend`);
    this.name = 'NotImplementedStorageError';
  }
}
