import { verifyAccessToken } from '../services/token.service.js';
import { User } from '../models/User.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { roleSatisfies } from '../utils/roleAuthorization.js';

function extractAccessToken(req) {
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Verifies the access token, loads the current user (fresh from the DB, not
 * just the token payload, so a deactivated/deleted account is rejected
 * immediately rather than waiting for token expiry), and attaches it to
 * req.user. Every protected route in the app uses this.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = extractAccessToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Account not found or deactivated');
  }

  req.user = user;
  next();
});

/**
 * Gates a route to one or more roles. Must run after requireAuth.
 * Usage: router.get('/admin/x', requireAuth, requireRole('admin'), handler)
 *
 * super_admin satisfies any check that lists 'admin' (a strict superset —
 * see roleSatisfies in utils/roleAuthorization.js) without every admin
 * route needing to list both roles explicitly.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    if (!roleSatisfies(req.user.role, roles)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
}
