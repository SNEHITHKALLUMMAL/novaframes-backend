/**
 * Wraps an async route/controller handler so rejected promises are forwarded
 * to Express's error-handling middleware instead of causing unhandled rejections.
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
