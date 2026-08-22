import { env } from '../../config/env.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';

let instance = null;

/**
 * Single point of storage-backend selection. Everything else in the app
 * (adapters, video service in later phases) calls getStorageProvider()
 * rather than importing a concrete class — swapping STORAGE_PROVIDER=s3
 * in production requires implementing S3StorageProvider against the same
 * contract (StorageProvider.js) and adding one branch here, nothing else.
 */
export function getStorageProvider() {
  if (instance) return instance;

  switch (env.storage.provider) {
    case 'local':
      instance = new LocalStorageProvider();
      break;
    default:
      throw new Error(
        `Unknown STORAGE_PROVIDER "${env.storage.provider}". ` +
          `Only "local" is implemented in this build — a production S3-compatible ` +
          `provider needs real bucket credentials this environment doesn't have.`
      );
  }

  return instance;
}
