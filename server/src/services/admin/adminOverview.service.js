import { User } from '../../models/User.model.js';
import { GenerationJob } from '../../models/GenerationJob.model.js';
import { Video } from '../../models/Video.model.js';
import { Subscription } from '../../models/Subscription.model.js';
import { Payment } from '../../models/Payment.model.js';
import { JOB_STATUS, PAYMENT_STATUS } from '../../constants/enums.js';
import { getQueueCounts } from '../../queues/generation.queue.js';

/**
 * Every number here is a real aggregation against the database — no
 * placeholder metrics. GPU utilization and per-worker-process monitoring
 * are deliberately NOT included: there is no live worker/GPU registry to
 * report on truthfully (see docs/ADMIN_DASHBOARD.md), and fabricating
 * plausible-looking numbers for them would be exactly the fake-data
 * problem the SRS rules out for admin analytics.
 */
export async function getOverviewStats() {
  const [
    totalUsers,
    activeUsers,
    jobStatusAgg,
    totalVideos,
    subscriptionPlanAgg,
    revenueAgg,
    queueCounts,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    GenerationJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Video.countDocuments(),
    Subscription.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
    Payment.aggregate([
      { $match: { status: PAYMENT_STATUS.SUCCEEDED } },
      { $group: { _id: null, totalCents: { $sum: '$amount' } } },
    ]),
    getQueueCounts(),
  ]);

  const jobsByStatus = Object.fromEntries(Object.values(JOB_STATUS).map((s) => [s, 0]));
  for (const { _id, count } of jobStatusAgg) {
    if (_id in jobsByStatus) jobsByStatus[_id] = count;
  }

  const subscriptionsByPlan = Object.fromEntries(subscriptionPlanAgg.map((s) => [s._id, s.count]));

  return {
    totalUsers,
    activeUsers,
    totalVideos,
    totalJobs: Object.values(jobsByStatus).reduce((sum, n) => sum + n, 0),
    jobsByStatus,
    subscriptionsByPlan,
    totalRevenueCents: revenueAgg[0]?.totalCents ?? 0,
    queue: queueCounts,
  };
}
