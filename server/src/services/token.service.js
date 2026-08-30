import jwt from 'jsonwebtoken';
import { env, isProduction } from '../config/env.js';

/**
 * Access token: short-lived, carries { sub, role }. Sent both as an httpOnly
 * cookie (browser convenience) and in the JSON response body (non-browser
 * API clients that prefer Authorization: Bearer).
 *
 * Refresh token: longer-lived, carries { sub, tokenVersion, jti }, httpOnly
 * cookie only — never returned in a JSON body. Checked against
 * User.tokenVersion (bulk invalidation — password change / logout
 * everywhere) AND against a Session document matched by jti (per-device
 * revocation + reuse detection — see models/Session.model.js and
 * auth.service.js#refreshSession). Both checks exist for different jobs:
 * tokenVersion answers "has this user invalidated everything since this
 * token was issued", the Session lookup answers "is this specific
 * device's session still active".
 */

export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
}

export function signRefreshToken(user, jti) {
  return jwt.sign(
    { sub: user._id.toString(), tokenVersion: user.tokenVersion, jti },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.secret); // throws JsonWebTokenError/TokenExpiredError on failure
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

const baseCookieOptions = {
  httpOnly: true,
  secure: isProduction, // requires HTTPS in production; allowed over http in dev
  sameSite: isProduction ? 'strict' : 'lax',
  path: '/',
};

export function accessTokenCookieOptions() {
  return { ...baseCookieOptions, maxAge: 15 * 60 * 1000 };
}

export function refreshTokenCookieOptions() {
  return { ...baseCookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/v1/auth' };
}
