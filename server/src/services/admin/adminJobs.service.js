import { GenerationJob } from '../../models/GenerationJob.model.js';
import { JOB_STATUS } from '../../constants/enums.js';
import { ApiError } from '../../utils/ApiError.js';
import { enqueueGenerationJob } from '../../queues/generation.queue.js';
import { publishJobStatus } from '../../realtime/publishJobStatus.js';
import { getPlanDefinition } from '../../constants/plans.js';
import { getOrCreateSubscription } from '../subscription.service.js';
import { writeAuditLog } from '../adminAuditLog.service.js';

export async function listAllJobs({ status, page, limit }) {
  const filter = {};
  if (status) filter.status = status;

  const [jobs, total] = await Promise.all([
    GenerationJob.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('owner', 'name email')
      .populate('aiModel', 'name modelId')
      .lean(),
    GenerationJob.countDocuments(filter),
  ]);

  return { jobs, total, page, limit };
}

/**
 * SRS PHASE_08/09 "failed job recovery" — didn't exist before this phase.
 * An admin could only VIEW a failed job (listAllJobs above), never
 * requeue one — a job that exhausted all 3 automatic retries (a
 * transient Redis blip, a momentary GPU host issue) had no recovery path
 * except the user manually resubmitting a brand-new job, losing the
 * original's history/linkage.
 *
 * Deliberately does NOT re-charge usage: the original charge was already
 * refunded when the job failed (PHASE_12's refundGenerationUsage, called
 * from the worker's failure handler). An admin-initiated retry is a
 * support/recovery action for what was the platform's failure, not the
 * user's — re-charging them for a retry of something that wasn't their
 * fault would be exactly the kind of double-charge the SRS's credit
 * rules guard against in spirit, even though it's not the literal
 * same-job-same-charge case that mechanism was built for.
 */
export async function retryFailedJob(actorId, jobId) {
  const job = await GenerationJob.findById(jobId);
  if (!job) throw ApiError.notFound('Generation job not found');
  if (job.status !== JOB_STATUS.FAILED) {
    throw ApiError.badRequest('Only failed jobs can be retried');
  }

  const subscription = await getOrCreateSubscription(job.owner);
  const planDefinition = getPlanDefinition(subscription.plan);

  job.status = JOB_STATUS.PENDING;
  job.error = null;
  job.completedAt = null;
  job.progressPercent = 0;
  await job.save();

  await enqueueGenerationJob(job._id.toString(), { priority: planDefinition.queuePriority });

  job.status = JOB_STATUS.QUEUED;
  job.bullJobId = job._id.toString();
  await job.save();
  await publishJobStatus(job);

  await writeAuditLog({
    actorId,
    action: 'generation_job.retried',
    targetType: 'GenerationJob',
    targetId: job._id,
    metadata: { previousStatus: JOB_STATUS.FAILED },
  });

  return job;
}
