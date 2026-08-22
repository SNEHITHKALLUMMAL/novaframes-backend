import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import * as modelService from '../services/model.service.js';

export const listModels = asyncHandler(async (req, res) => {
  const models = await modelService.listEnabledModels(req.query.type);
  // Model catalog changes rarely (an admin action, not per-request) — a
  // short private cache avoids every page load re-querying it, without
  // risking a stale view for long after an admin does change something.
  res.set('Cache-Control', 'private, max-age=60');
  sendSuccess(res, { message: 'Models retrieved', data: { models } });
});
