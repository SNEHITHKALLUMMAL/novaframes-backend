import { publishJobEvent } from './jobEventsPubSub.js';
import { logger } from '../utils/logger.js';

/**
 * Best-effort push notification. MongoDB is always the source of truth for
 * job state (the API's GET /generations/:id can always be re-fetched to
 * recover the real state) — this is purely a "something changed, you
 * should refetch" signal, so a Redis publish failure here must never break
 * the actual job-processing flow. Errors are logged and swallowed.
 */
export async function publishJobStatus(job) {
  try {
    await publishJobEvent({
      generationJobId: job._id.toString(),
      ownerId: job.owner.toString(),
      status: job.status,
      progressPercent: job.progressPercent,
      queuePosition: job.queuePosition ?? null,
      error: job.error?.message ?? null,
    });
  } catch (err) {
    logger.warn('Failed to publish job status event', { error: err.message });
  }
}
