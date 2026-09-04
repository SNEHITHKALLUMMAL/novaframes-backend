import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import * as projectService from '../services/project.service.js';

export const createProject = asyncHandler(async (req, res) => {
  const project = await projectService.createProject(req.user._id, req.body);
  sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: 'Project created', data: { project } });
});

export const listProjects = asyncHandler(async (req, res) => {
  const result = await projectService.listProjects(req.user._id, req.query);
  sendSuccess(res, { message: 'Projects retrieved', data: result });
});

export const getProject = asyncHandler(async (req, res) => {
  const project = await projectService.getOwnedProject(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Project retrieved', data: { project } });
});

export const updateProject = asyncHandler(async (req, res) => {
  const project = await projectService.updateProject(req.user._id, req.params.id, req.body);
  sendSuccess(res, { message: 'Project updated', data: { project } });
});

export const deleteProject = asyncHandler(async (req, res) => {
  await projectService.deleteProject(req.user._id, req.params.id);
  sendSuccess(res, { message: 'Project deleted' });
});
