import { ApiError } from '../utils/ApiError.js';

export const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp']);
export const MIN_IMAGE_DIMENSION = 64;
export const MAX_IMAGE_DIMENSION = 4096;

export const FORMAT_TO_EXTENSION = { jpeg: 'jpg', png: 'png', webp: 'webp' };
export const FORMAT_TO_MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * The actual decision logic behind the SRS's image-upload security rules
 * (validate real format, validate dimensions) — pulled out of
 * upload.service.js so it can be unit-tested without pulling in mongoose
 * (UploadedFile) or the storage layer. Takes a sharp `metadata()` result
 * (or any object with the same shape) and either returns normalized info
 * or throws the same ApiError the full upload flow throws.
 */
export function validateImageMetadata(metadata) {
  if (!metadata?.format || !ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
    throw ApiError.badRequest(
      `Detected file type "${metadata?.format ?? 'unknown'}" is not supported. Use JPEG, PNG, or WebP.`
    );
  }

  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < MIN_IMAGE_DIMENSION ||
    metadata.height < MIN_IMAGE_DIMENSION ||
    metadata.width > MAX_IMAGE_DIMENSION ||
    metadata.height > MAX_IMAGE_DIMENSION
  ) {
    throw ApiError.badRequest(
      `Image dimensions must be between ${MIN_IMAGE_DIMENSION}x${MIN_IMAGE_DIMENSION} and ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION}px`
    );
  }

  return {
    format: metadata.format,
    extension: FORMAT_TO_EXTENSION[metadata.format],
    mimeType: FORMAT_TO_MIME[metadata.format],
    width: metadata.width,
    height: metadata.height,
  };
}
