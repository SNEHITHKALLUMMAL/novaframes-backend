import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { accessTokenCookieOptions, refreshTokenCookieOptions } from '../services/token.service.js';
import * as authService from '../services/auth.service.js';

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('accessToken', accessToken, accessTokenCookieOptions());
  res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions());
}

function sessionMetaFrom(req) {
  return { userAgent: req.headers['user-agent'] || null, ip: req.ip };
}

export const register = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.registerUser(req.body, sessionMetaFrom(req));
  setAuthCookies(res, accessToken, refreshToken);
  sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Account created successfully',
    data: { user, accessToken },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.loginUser(req.body, sessionMetaFrom(req));
  setAuthCookies(res, accessToken, refreshToken);
  sendSuccess(res, {
    message: 'Logged in successfully',
    data: { user, accessToken },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.refreshSession(
    req.cookies?.refreshToken,
    sessionMetaFrom(req)
  );
  setAuthCookies(res, accessToken, refreshToken);
  sendSuccess(res, {
    message: 'Session refreshed',
    data: { user, accessToken },
  });
});

export const logout = asyncHandler(async (req, res) => {
  // Actually revokes the session server-side now (PHASE_03) — previously
  // this only cleared cookies client-side, leaving the refresh token
  // valid server-side until it naturally expired.
  await authService.logoutSession(req.cookies?.refreshToken);
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  sendSuccess(res, { message: 'Logged out successfully' });
});

export const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAllSessions(req.user._id);
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  sendSuccess(res, { message: 'Logged out of all sessions' });
});

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await authService.listMySessions(req.user._id);
  sendSuccess(res, { message: 'Sessions retrieved', data: { sessions } });
});

export const revokeSession = asyncHandler(async (req, res) => {
  await authService.revokeMySession(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Session revoked' });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email);
  // Same response whether or not the email matched an account —
  // enumeration-safe by design (see auth.service.js#requestPasswordReset).
  sendSuccess(res, { message: 'If an account with that email exists, a reset link has been sent' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.newPassword);
  sendSuccess(res, { message: 'Password reset successfully. Please log in with your new password.' });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  await authService.verifyEmail(req.body.token);
  sendSuccess(res, { message: 'Email verified successfully' });
});

export const resendVerification = asyncHandler(async (req, res) => {
  await authService.resendVerificationEmail(req.user._id);
  sendSuccess(res, { message: 'Verification email sent' });
});

export const me = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Current user', data: { user: req.user } });
});
