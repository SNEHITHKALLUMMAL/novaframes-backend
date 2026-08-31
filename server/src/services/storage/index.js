import { env } from '../../config/env.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { ObjectStorageProvider } from './ObjectStorageProvider.js';

let instance = null;

/**
 * Single point of storage-backend selection. Everything else in the app
 * (adapters, video service) calls getStorageProvider() rather than
 * importing a concrete class — env.js already refuses to start with
 * STORAGE_PROVIDER=local in production, so reaching the default branch
 * below in a real deployment means a config error, not a valid third option.
 */
export function getStorageProvider() {
  if (instance) return instance;

  switch (env.storage.provider) {
    case 'local':
      instance = new LocalStorageProvider();
      break;
    case 's3':
      instance = new ObjectStorageProvider();
      break;
    default:
      throw new Error(
        `Unknown STORAGE_PROVIDER "${env.storage.provider}". Valid values: "local", "s3".`
      );
  }

  return instance;
}
