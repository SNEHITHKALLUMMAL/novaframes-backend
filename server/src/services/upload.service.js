import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

import { UploadedFile } from '../models/UploadedFile.model.js';
import { getStorageProvider } from './storage/index.js';
import { ApiError } from '../utils/ApiError.js';
import { UPLOADED_FILE_PURPOSE } from '../constants/enums.js';
import { validateImageMetadata } from './imageValidation.js';

/**
 * The actual security boundary for image uploads (SRS file_upload_security:
 * validate MIME type, validate file size, generate server-side filenames,
 * prevent path traversal, prevent malicious uploads). Trusts nothing the
 * client claims — decodes the real bytes with sharp and derives every
 * stored fact (format, dimensions, extension) from what the file actually
 * is, not its reported Content-Type or filename. The format/dimension
 * decision logic itself lives in imageValidation.js (unit-tested — see
 * server/src/services/imageValidation.test.js) so it's exercised
 * independently of mongoose/storage.
 */
export async function validateAndStoreImage(userId, file) {
  if (!file) {
    throw ApiError.badRequest('No file was uploaded');
  }

  let metadata;
  try {
    metadata = await sharp(file.buffer).metadata();
  } catch {
    throw ApiError.badRequest('File is not a valid image or is corrupted');
  }

  const { extension, mimeType, width, height } = validateImageMetadata(metadata);

  // Server-generated filename only — the client's original filename is
  // never used to construct a storage path (SRS: "Never trust uploaded
  // filenames" / "Prevent path traversal"). It's kept only as a display
  // label, sanitized to its basename so even that can't smuggle a path.
  const filename = `${randomUUID()}.${extension}`;
  const storageKey = `uploads/${userId.toString()}/${filename}`;

  const storage = getStorageProvider();
  const asset = await storage.save(file.buffer, storageKey);

  const checksum = createHash('sha256').update(file.buffer).digest('hex');
  const safeOriginalName = path.basename(file.originalname || 'upload').slice(0, 255);

  const uploadedFile = await UploadedFile.create({
    owner: userId,
    purpose: UPLOADED_FILE_PURPOSE.GENERATION_INPUT,
    originalName: safeOriginalName,
    storageKey: asset.key,
    mimeType,
    sizeBytes: asset.sizeBytes,
    checksum,
    metadata: { width, height, format: metadata.format },
  });

  return { uploadedFile, url: asset.url };
}

export async function getOwnedUploadedFile(userId, fileId) {
  const file = await UploadedFile.findById(fileId);
  if (!file || !file.owner.equals(userId)) {
    throw ApiError.notFound('Uploaded file not found');
  }
  return file;
}
