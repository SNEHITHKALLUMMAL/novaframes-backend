import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED_CLIENT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * multer.memoryStorage() — files never touch disk under a client-controlled
 * name; the buffer goes straight to services/upload.service.js, which
 * inspects the actual bytes (via sharp) before anything is persisted.
 *
 * The fileFilter here is a cheap, EARLY rejection based on what the client
 * *claims* the file is — it is NOT the security boundary. A client can lie
 * about Content-Type, so this only saves a wasted upload for the common
 * "wrong file type" case; the authoritative check is the real image-decode
 * step in the service, which is what actually enforces "Validate MIME type"
 * and "Prevent malicious uploads" from the SRS.
 */
function fileFilter(req, file, cb) {
  if (!ALLOWED_CLIENT_MIME_TYPES.has(file.mimetype)) {
    cb(ApiError.badRequest(`Unsupported file type "${file.mimetype}". Use JPEG, PNG, or WebP.`));
    return;
  }
  cb(null, true);
}

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.resourceLimits.maxUploadSizeBytes, files: 1 },
  fileFilter,
}).single('file');
