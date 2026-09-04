import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env.js';

/**
 * Production StorageProvider backed by any S3-compatible object store —
 * AWS S3 itself, or Cloudflare R2 / Backblaze B2 / MinIO / DigitalOcean
 * Spaces via STORAGE_ENDPOINT. Selected when STORAGE_PROVIDER=s3
 * (see ./index.js and src/config/env.js, which refuses to start in
 * production on the local provider).
 *
 * Keys are sanitized the same way LocalStorageProvider sanitizes them
 * (reject empty keys, reject path-traversal-shaped keys) even though S3
 * keys aren't filesystem paths — this keeps object naming predictable and
 * blocks a caller from smuggling `..`/absolute-path-shaped keys into a
 * listing or lifecycle-rule assumption elsewhere in the app.
 */
export class ObjectStorageProvider {
  constructor({
    bucket = env.storage.bucket,
    region = env.storage.region,
    endpoint = env.storage.endpoint,
    forcePathStyle = env.storage.forcePathStyle,
    accessKeyId = env.storage.accessKey,
    secretAccessKey = env.storage.secretKey,
    signedUrlExpirySeconds = env.storage.signedUrlExpirySeconds,
    client, // injectable for tests
  } = {}) {
    if (!bucket) throw new Error('ObjectStorageProvider requires a bucket (STORAGE_BUCKET)');
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('ObjectStorageProvider requires STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY');
    }

    this.bucket = bucket;
    this.signedUrlExpirySeconds = signedUrlExpirySeconds;
    this.client =
      client ??
      new S3Client({
        region,
        endpoint,
        forcePathStyle,
        credentials: { accessKeyId, secretAccessKey },
      });
  }

  #sanitizeKey(key) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('Storage key must be a non-empty string');
    }
    // Normalize and reject anything that tries to climb out of its own
    // prefix (`../`, a leading `/`, backslashes) — same intent as
    // LocalStorageProvider's path-traversal guard, adapted for object keys.
    const normalized = path.posix.normalize(key.split(path.sep).join('/'));
    if (normalized.startsWith('..') || normalized.startsWith('/') || normalized.includes('../')) {
      throw new Error(`Refusing storage key that resolves outside its prefix: ${key}`);
    }
    return normalized;
  }

  async save(buffer, key) {
    const safeKey = this.#sanitizeKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: safeKey, Body: buffer })
    );
    return { key: safeKey, url: this.getUrl(safeKey), sizeBytes: buffer.length };
  }

  async saveFile(sourcePath, key) {
    const buffer = await fs.readFile(sourcePath);
    return this.save(buffer, key);
  }

  async read(key) {
    const safeKey = this.#sanitizeKey(key);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: safeKey })
    );
    const chunks = [];
    for await (const chunk of result.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async delete(key) {
    const safeKey = this.#sanitizeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey }));
  }

  /**
   * Synchronous, non-signed reference. NOT directly fetchable for a
   * private bucket — see StorageProvider.js's typedef note. Prefer
   * getSignedReadUrl() for anything actually served to a client. Only
   * produces a real, working URL when STORAGE_PUBLIC_BASE_URL is set
   * (e.g. a CDN in front of a public-read bucket).
   */
  getUrl(key) {
    const safeKey = this.#sanitizeKey(key);
    if (env.storage.publicBaseUrl) {
      return `${env.storage.publicBaseUrl.replace(/\/+$/, '')}/${safeKey}`;
    }
    return `s3://${this.bucket}/${safeKey}`;
  }

  /**
   * Time-limited, directly-fetchable URL. Generate this per-request
   * (e.g. when listing/serving a video) — never persist it, since it
   * expires (SRS "Implement signed URL generation" / "secure media
   * access", PHASE_07 and PHASE_14).
   */
  async getSignedReadUrl(key, expirySeconds = this.signedUrlExpirySeconds) {
    const safeKey = this.#sanitizeKey(key);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: safeKey });
    return getSignedUrl(this.client, command, { expiresIn: expirySeconds });
  }

  /**
   * Downloads the object to a local temp file and returns its path — for
   * callers (the Wan GPU adapter) that need a real filesystem path to hand
   * to ffmpeg/Python rather than a Buffer. Caller is responsible for
   * cleaning up the temp file when done.
   */
  async getLocalCopy(key) {
    const safeKey = this.#sanitizeKey(key);
    const buffer = await this.read(safeKey);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'novaframe-storage-'));
    const localPath = path.join(tmpDir, path.basename(safeKey));
    await fs.writeFile(localPath, buffer);
    return localPath;
  }

  async exists(key) {
    const safeKey = this.#sanitizeKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: safeKey }));
      return true;
    } catch {
      return false;
    }
  }
}
