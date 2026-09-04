/**
 * Standard application error. Thrown anywhere in controllers/services;
 * caught once by the central error middleware (server/src/middleware/errorHandler.js).
 */
export class ApiError extends Error {
  constructor(statusCode, message, errors = [], isOperational = true) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errors = []) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, message);
  }

  static locked(message = 'Account temporarily locked') {
    return new ApiError(423, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message, [], false);
  }
}
