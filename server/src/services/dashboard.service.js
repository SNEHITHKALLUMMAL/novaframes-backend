import { GenerationJob } from '../models/GenerationJob.model.js';
import { Video } from '../models/Video.model.js';
import { JOB_STATUS } from '../constants/enums.js';

const RECENT_JOBS_LIMIT = 5;
const RECENT_VIDEOS_LIMIT = 6;

/**
 * Aggregates only what actually exists today: GenerationJob and Video
 * documents owned by this user. Subscription status and usage quotas (also
 * part of the SRS's dashboard spec) are intentionally omitted — those
 * models have no populated data or business logic behind them until
 * Phase 18, and showing a placeholder "Free tier" badge would be exactly
 * the fake data the SRS's dashboard rule rules out.
 */
export async function getDashboardSummary(userId) {
  const [statusAgg, recentJobs, recentVideos, totalVideos] = await Promise.all([
    GenerationJob.aggregate([
      { $match: { owner: userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    GenerationJob.find({ owner: userId })
      .sort({ createdAt: -1 })
      .limit(RECENT_JOBS_LIMIT)
      .populate('aiModel', 'name modelId')
      .populate('outputVideo', 'title thumbnailUrl status')
      .lean(),
    Video.find({ owner: userId })
      .sort({ createdAt: -1 })
      .limit(RECENT_VIDEOS_LIMIT)
      .select('title thumbnailUrl status durationSeconds resolution type createdAt')
      .lean(),
    Video.countDocuments({ owner: userId }),
  ]);

  const statusCounts = Object.fromEntries(Object.values(JOB_STATUS).map((status) => [status, 0]));
  for (const { _id, count } of statusAgg) {
    if (_id in statusCounts) statusCounts[_id] = count;
  }

  const totalJobs = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);

  return {
    totalJobs,
    totalVideos,
    statusCounts,
    recentJobs,
    recentVideos,
  };
}
