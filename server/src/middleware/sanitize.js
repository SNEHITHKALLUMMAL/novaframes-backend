/**
 * Wraps express-mongo-sanitize so it can be unit-tested (the real
 * mongoSanitize() call is injected, not hardcoded) and so it correctly
 * skips routes whose body is an intentionally-untouched raw Buffer (the
 * Stripe webhook route — see app.js) rather than trying to sanitize
 * binary data as if it were a parsed object.
 *
 * MUST be mounted after body parsing (app.js does this) — see app.js's
 * comment for the bug this fixes: mounted before express.json(), this
 * sanitizes an empty/undefined req.body and never touches the actual
 * parsed body at all.
 */
export function createSanitizeMiddleware(sanitizeFn) {
  return (req, res, next) => {
    if (Buffer.isBuffer(req.body)) return next();
    sanitizeFn()(req, res, next);
  };
}
