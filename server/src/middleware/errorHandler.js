import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { isProduction } from '../config/env.js';

/**
 * Converts thrown errors (ApiError or unexpected) into the SRS's standard
 * error envelope: { success: false, message, errors }.
 * Must be registered LAST in server/src/app.js.
 */
export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    error = new ApiError(statusCode, error.message || 'Internal server error', [], false);
  }

  if (!error.isOperational) {
    logger.error('Unhandled error', { message: err.message, stack: err.stack });
  } else {
    logger.warn('Handled application error', { message: error.message, statusCode: error.statusCode });
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message,
    errors: error.errors || [],
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
