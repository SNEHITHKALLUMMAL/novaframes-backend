import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { GenerationJob } from '../src/models/GenerationJob.model.js';
import { getBullJob, enqueueGenerationJob } from '../src/queues/generation.queue.js';
import { getOrCreateSubscription } from '../src/services/subscription.service.js';
import { getPlanDefinition } from '../src/constants/plans.js';
import { JOB_STATUS } from '../src/constants/enums.js';
import { logger } from '../src/utils/logger.js';

/**
 * Disaster-recovery tool (PHASE_26) — for the specific scenario of total
 * Redis data loss (see docs/DISASTER_RECOVERY.md). Redis in this
 * architecture holds BullMQ's queue state, which is NOT the durable
 * record of a generation job — MongoDB is (env.js/DATABASE.md's
 * repeated point throughout this project). So a Redis loss doesn't lose
 * any job's data, but it DOES lose track of which QUEUED/PROCESSING/
 * RETRYING jobs were waiting to be worked on — those jobs exist correctly
 * in MongoDB but have no corresponding BullMQ entry anymore, and would
 * otherwise sit forever with no worker ever picking them up again.
 *
 * This script finds exactly those orphaned jobs and re-enqueues them.
 * Safe to run multiple times and safe to run when Redis DIDN'T actually
 * lose data too — enqueueGenerationJob() uses the job's own Mongo _id as
 * the BullMQ jobId (PHASE_08/generation.queue.js), so re-enqueueing a job
 * that's still correctly present in Redis is a no-op (BullMQ returns the
 * existing job rather than creating a duplicate), not a double-enqueue.
 *
 * Run with: node scripts/recover-orphaned-jobs.js [--dry-run]
 */

const DRY_RUN = process.argv.includes('--dry-run');
const RECOVERABLE_STATUSES = [JOB_STATUS.QUEUED, JOB_STATUS.PROCESSING, JOB_STATUS.RETRYING];

async function main() {
  await connectDatabase();

  const candidates = await GenerationJob.find({ status: { $in: RECOVERABLE_STATUSES } });
  logger.info(`Found ${candidates.length} job(s) in a recoverable status to check`);

  let requeued = 0;
  let alreadyPresent = 0;
  let failed = 0;

  for (const job of candidates) {
    try {
      const existing = await getBullJob(job._id.toString());
      if (existing) {
        alreadyPresent += 1;
        continue; // still correctly tracked in Redis — nothing to do
      }

      if (DRY_RUN) {
        logger.info(`[dry-run] Would re-enqueue orphaned job ${job._id} (status: ${job.status})`);
        requeued += 1;
        continue;
      }

      const subscription = await getOrCreateSubscription(job.owner);
      const planDefinition = getPlanDefinition(subscription.plan);
      await enqueueGenerationJob(job._id.toString(), { priority: planDefinition.queuePriority });
      logger.info(`Re-enqueued orphaned job ${job._id}`);
      requeued += 1;
    } catch (err) {
      failed += 1;
      logger.error(`Failed to recover job ${job._id}`, { error: err.message });
    }
  }

  logger.info(
    `Recovery complete${DRY_RUN ? ' (dry run — nothing was actually changed)' : ''}: ` +
      `${requeued} re-enqueued, ${alreadyPresent} already present, ${failed} failed`
  );

  await disconnectDatabase();
}

main().catch((err) => {
  logger.error('Recovery script crashed', { error: err.message });
  process.exit(1);
});
