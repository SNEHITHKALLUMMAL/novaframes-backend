import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import * as userService from '../services/user.service.js';

export const getMyProfile = asyncHandler(async (req, res) => {
  const user = await userService.getProfile(req.user._id);
  sendSuccess(res, { message: 'Profile retrieved', data: { user } });
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user._id, req.body);
  sendSuccess(res, { message: 'Profile updated successfully', data: { user } });
});

export const changeMyPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await userService.changePassword(req.user._id, currentPassword, newPassword);
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  sendSuccess(res, {
    message: 'Password changed successfully. Please log in again.',
  });
});

export const deleteMyAccount = asyncHandler(async (req, res) => {
  await userService.deleteAccount(req.user._id, req.body.password);
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  sendSuccess(res, { message: 'Account deleted successfully' });
});
