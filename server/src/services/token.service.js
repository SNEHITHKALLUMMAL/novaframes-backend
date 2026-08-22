import jwt from 'jsonwebtoken';
import { env, isProduction } from '../config/env.js';

/**
 * Access token: short-lived, carries { sub, role }. Sent both as an httpOnly
 * cookie (browser convenience) and in the JSON response body (non-browser
 * API clients that prefer Authorization: Bearer).
 *
 * Refresh token: longer-lived, carries { sub, tokenVersion }, httpOnly cookie
 * only — never returned in a JSON body. Checked against User.tokenVersion on
 * use so a password change or explicit logout-everywhere invalidates it
 * without needing a server-side session/blacklist store.
 */

export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
}

export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), tokenVersion: user.tokenVersion },
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
