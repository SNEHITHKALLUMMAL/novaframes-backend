import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { accessTokenCookieOptions, refreshTokenCookieOptions } from '../services/token.service.js';
import * as authService from '../services/auth.service.js';

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('accessToken', accessToken, accessTokenCookieOptions());
  res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions());
}

export const register = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.registerUser(req.body);
  setAuthCookies(res, accessToken, refreshToken);
  sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Account created successfully',
    data: { user, accessToken },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.loginUser(req.body);
  setAuthCookies(res, accessToken, refreshToken);
  sendSuccess(res, {
    message: 'Logged in successfully',
    data: { user, accessToken },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.refreshSession(
    req.cookies?.refreshToken
  );
  setAuthCookies(res, accessToken, refreshToken);
  sendSuccess(res, {
    message: 'Session refreshed',
    data: { user, accessToken },
  });
});

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  sendSuccess(res, { message: 'Logged out successfully' });
});

export const me = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Current user', data: { user: req.user } });
});
