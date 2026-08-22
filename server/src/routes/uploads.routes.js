import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { uploadImage as uploadImageMiddleware } from '../middleware/upload.js';
import { ApiError } from '../utils/ApiError.js';
import * as uploadController from '../controllers/upload.controller.js';

const router = Router();

router.use(requireAuth);

/**
 * multer's middleware uses a callback-style API, not promises, so it can't
 * go through asyncHandler — this adapts its errors (file too large, wrong
 * field name, etc.) into the same ApiError/central-error-handler pipeline
 * every other route uses, instead of a raw multer error shape leaking out.
 */
function handleUpload(req, res, next) {
  uploadImageMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest('File is too large'));
      }
      return next(ApiError.badRequest(`Upload error: ${err.message}`));
    }
    if (err) return next(err); // already an ApiError from fileFilter, or unexpected
    next();
  });
}

router.post('/', uploadLimiter, handleUpload, uploadController.uploadImage);

export default router;
