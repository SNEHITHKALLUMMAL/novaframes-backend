import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import * as videoService from '../services/video.service.js';

export const listVideos = asyncHandler(async (req, res) => {
  const result = await videoService.listVideos(req.user._id, req.query);
  sendSuccess(res, { message: 'Videos retrieved', data: result });
});

export const getVideo = asyncHandler(async (req, res) => {
  const video = await videoService.getOwnedVideo(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Video retrieved', data: { video } });
});

export const renameVideo = asyncHandler(async (req, res) => {
  const video = await videoService.renameVideo(req.user._id, req.params.id, req.body.title);
  sendSuccess(res, { message: 'Video renamed', data: { video } });
});

export const assignVideoProject = asyncHandler(async (req, res) => {
  const video = await videoService.assignVideoProject(req.user._id, req.params.id, req.body.projectId);
  sendSuccess(res, { message: 'Video moved', data: { video } });
});

export const deleteVideo = asyncHandler(async (req, res) => {
  await videoService.deleteVideo(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Video deleted' });
});
