import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';

/**
 * Local-disk StorageProvider. Used when STORAGE_PROVIDER=local (the default).
 * Files live under env.storage.localRoot ("storage/" by default, gitignored).
 * Every key is sanitized to prevent path traversal — this is a direct
 * implementation of the SRS's "Prevent path traversal" file-upload rule,
 * applied to storage writes generally, not just multer uploads.
 */
export class LocalStorageProvider {
  constructor(rootDir = env.storage.localRoot) {
    this.rootDir = path.resolve(process.cwd(), rootDir);
  }

  #resolveKey(key) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('Storage key must be a non-empty string');
    }
    const fullPath = path.resolve(this.rootDir, key);
    if (fullPath !== this.rootDir && !fullPath.startsWith(this.rootDir + path.sep)) {
      throw new Error(`Refusing storage key that resolves outside the storage root: ${key}`);
    }
    return fullPath;
  }

  async save(buffer, key) {
    const fullPath = this.#resolveKey(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    const stats = await fs.stat(fullPath);
    return { key, url: this.getUrl(key), sizeBytes: stats.size };
  }

  async saveFile(sourcePath, key) {
    const fullPath = this.#resolveKey(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.copyFile(sourcePath, fullPath);
    const stats = await fs.stat(fullPath);
    return { key, url: this.getUrl(key), sizeBytes: stats.size };
  }

  async read(key) {
    return fs.readFile(this.#resolveKey(key));
  }

  async delete(key) {
    await fs.rm(this.#resolveKey(key), { force: true });
  }

  getUrl(key) {
    // Served by a static route (wired in Phase 17 alongside the video
    // library) — for now this is the logical, storable reference.
    return `/storage/${key.split(path.sep).join('/')}`;
  }

  getAbsolutePath(key) {
    return this.#resolveKey(key);
  }
}
