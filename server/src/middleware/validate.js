import { ApiError } from '../utils/ApiError.js';

/**
 * Wraps a Zod schema into Express middleware. Validates any combination of
 * body/query/params, replaces req.<part> with the parsed (and coerced) data,
 * and forwards a single well-formed ApiError on failure — so every route in
 * the app gets identical validation-error shape, per the SRS's
 * "Validate all incoming data" / centralized-error-handling rule.
 *
 * Usage:
 *   router.post('/', validate({ body: registerSchema }), controller.register)
 */
export function validate(schemas) {
  return (req, res, next) => {
    try {
      for (const part of ['body', 'query', 'params']) {
        if (schemas[part]) {
          req[part] = schemas[part].parse(req[part]);
        }
      }
      next();
    } catch (err) {
      if (err.name === 'ZodError') {
        const errors = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return next(ApiError.badRequest('Validation failed', errors));
      }
      next(err);
    }
  };
}
