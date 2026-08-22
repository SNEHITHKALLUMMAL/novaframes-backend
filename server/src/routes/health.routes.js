import { Router } from 'express';
import mongoose from 'mongoose';
import { getDatabaseState } from '../config/db.js';
import { getRedisConnection } from '../config/redis.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// GET /api/v1/health
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const dbState = getDatabaseState();

    let redisState = 'unknown';
    try {
      const redis = getRedisConnection();
      redisState = redis.status; // 'ready', 'connecting', 'end', etc.
    } catch {
      redisState = 'unavailable';
    }

    const healthy = dbState === 'connected' && redisState === 'ready';

    sendSuccess(res, {
      statusCode: healthy ? 200 : 503,
      message: healthy ? 'All systems operational' : 'One or more subsystems unavailable',
      data: {
        api: 'ok',
        mongodb: dbState,
        redis: redisState,
        mongooseVersion: mongoose.version,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

export default router;
