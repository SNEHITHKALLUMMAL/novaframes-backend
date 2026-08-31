import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { getRedisConnection } from '../config/redis.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { GENERATION_QUEUE_NAME } from '../queues/generation.queue.js';
import { GenerationJob } from '../models/GenerationJob.model.js';
import { AIModel } from '../models/AIModel.model.js';
import { getAdapter, listRegisteredAdapterKeys } from '../services/adapters/adapterRegistry.js';
import { registerAllAdapters } from '../services/adapters/registerAllAdapters.js';
import { JOB_STATUS } from '../constants/enums.js';
import { publishJobStatus } from '../realtime/publishJobStatus.js';
import { closeJobEventsPubSub } from '../realtime/jobEventsPubSub.js';
import { refundGenerationUsage } from '../services/usage.service.js';
import { runWithContext } from '../utils/requestContext.js';
import '../models/index.js';

/**
 * Runs as its own process (`npm run worker`), never inside the Express
 * request/response cycle — this is what lets AI inference live on separate
 * infrastructure (local GPU, remote GPU server, cloud) from the API server,
 * per the SRS's "do not tightly couple AI inference to the Express process".
 *
 * Every status/progress change is also published via Redis pub/sub
 * (realtime/publishJobStatus.js) so the API process's Socket.IO server can
 * push it to the owning user in real time (Phase 16) — the worker doesn't
 * know or care that Socket.IO exists, it just publishes to Redis.
 */

class GenerationTimeoutError extends Error {
  constructor(ms) {
    super(`Generation exceeded the configured timeout of ${ms}ms`);
    this.name = 'GenerationTimeoutError';
    this.code = 'TIMEOUT';
  }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new GenerationTimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function processGenerationJob(bullJob) {
  const { generationJobId } = bullJob.data;
  const workerId = `worker-${process.pid}`;

  const genJob = await GenerationJob.findById(generationJobId);
  if (!genJob) {
    logger.warn('Generation job not found in MongoDB, skipping', { generationJobId });
    return;
  }

  if (genJob.status === JOB_STATUS.CANCELLED) {
    logger.info('Job was cancelled before processing started, skipping', { generationJobId });
    return;
  }

  // PHASE_17: every log line for the rest of this job's processing now
  // automatically carries the SAME requestId the original API call that
  // created it used (stamped onto the job at creation — see
  // generation.service.js#createGenerationJob) — the actual cross-service
  // correlation the SRS asks for, not just two separately-scoped ID
  // spaces that have to be manually cross-referenced during an incident.
  return runWithContext(
    { requestId: genJob.requestId, generationJobId: genJob._id.toString() },
    () => runGenerationJob(genJob, workerId, bullJob)
  );
}

async function runGenerationJob(genJob, workerId, bullJob) {
  genJob.status = JOB_STATUS.PROCESSING;
  genJob.startedAt = new Date();
  genJob.workerId = workerId;
  genJob.progressPercent = 0;
  await genJob.save();
  await publishJobStatus(genJob);

  const aiModel = await AIModel.findById(genJob.aiModel);
  if (!aiModel || !aiModel.isEnabled) {
    throw Object.assign(new Error('AI model is no longer available'), { code: 'MODEL_UNAVAILABLE' });
  }

  const adapter = getAdapter(aiModel.adapterKey); // throws ADAPTER_NOT_REGISTERED until Phase 10+

  const onProgress = async (percent) => {
    genJob.progressPercent = Math.max(0, Math.min(100, percent));
    await genJob.save();
    await bullJob.updateProgress(genJob.progressPercent);
    await publishJobStatus(genJob);
  };

  const result = await withTimeout(
    adapter.generate({
      job: genJob,
      model: aiModel,
      onProgress,
    }),
    env.resourceLimits.jobTimeoutMs
  );

  genJob.status = JOB_STATUS.COMPLETED;
  genJob.completedAt = new Date();
  genJob.progressPercent = 100;
  genJob.outputVideo = result?.videoId ?? null;
  genJob.thumbnailUrl = result?.thumbnailUrl ?? null;
  await genJob.save();
  await publishJobStatus(genJob);

  return result;
}

async function main() {
  await connectDatabase();
  registerAllAdapters();
  logger.info(`Registered adapters: ${listRegisteredAdapterKeys().join(', ')}`);

  const worker = new Worker(GENERATION_QUEUE_NAME, processGenerationJob, {
    connection: getRedisConnection(),
    concurrency: env.resourceLimits.maxConcurrentJobs,
    // BullMQ's default lock duration (30s) assumes short jobs — a real
    // model inference call (Wan, once enabled) can legitimately run for
    // minutes. Without this, BullMQ could mark a genuinely-still-running
    // job "stalled" and hand it to another worker mid-generation. Tied to
    // the same JOB_TIMEOUT the worker itself already enforces
    // (workers/generation.worker.js's withTimeout), so the two limits
    // stay consistent rather than one silently being stricter than the
    // other.
    lockDuration: env.resourceLimits.jobTimeoutMs,
  });

  worker.on('active', (job) => logger.info('Job started', { jobId: job.id }));
  worker.on('completed', (job) => logger.info('Job completed', { jobId: job.id }));
  // SRS PHASE_08 "queue health monitoring" — a stalled job (lock expired
  // without renewal, almost always meaning the worker process that held
  // it died mid-generation) was previously invisible in logs; BullMQ
  // handles the retry/recovery automatically (up to maxStalledCount, its
  // own default), but an operator had no way to know it happened at all
  // without this. lockDuration is already tied to jobTimeoutMs (see
  // Worker() options above), so a stall here is a genuine worker-death
  // signal, not a false positive from a merely-slow job.
  worker.on('stalled', (jobId) => logger.warn('Job stalled — worker may have died mid-processing', { jobId }));

  worker.on('failed', async (job, err) => {
    // This handler runs in the BullMQ 'failed' event, outside
    // processGenerationJob's call stack — needs its own runWithContext
    // wrap to carry the same requestId correlation the rest of this job's
    // logs used (see processGenerationJob above).
    const genJobForContext = job ? await GenerationJob.findById(job.data.generationJobId) : null;
    await runWithContext(
      { requestId: genJobForContext?.requestId, generationJobId: job?.data.generationJobId },
      async () => {
        logger.error('Job failed', { jobId: job?.id, error: err.message, code: err.code });

        const isFinalAttempt = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
        if (!isFinalAttempt) {
          // Not the final attempt — BullMQ will retry automatically per
          // the backoff policy. Mark the honest transient state
          // (RETRYING) rather than leaving the record silently stale at
          // whatever status it last had.
          try {
            const genJob = genJobForContext ?? (await GenerationJob.findById(job.data.generationJobId));
            if (genJob && genJob.status !== JOB_STATUS.CANCELLED) {
              genJob.status = JOB_STATUS.RETRYING;
              await genJob.save();
              await publishJobStatus(genJob);
            }
          } catch (updateErr) {
            logger.error('Failed to persist RETRYING state', { error: updateErr.message });
          }
          return;
        }

        try {
          const genJob = genJobForContext ?? (await GenerationJob.findById(job.data.generationJobId));
          if (genJob && genJob.status !== JOB_STATUS.CANCELLED) {
            // Distinguish a genuine timeout from every other failure
            // cause — GenerationTimeoutError already tags itself
            // `code: 'TIMEOUT'` (see withTimeout above); this just
            // reflects that into the job's own status rather than
            // collapsing every failure into undifferentiated FAILED.
            genJob.status = err.code === 'TIMEOUT' ? JOB_STATUS.TIMEOUT : JOB_STATUS.FAILED;
            genJob.completedAt = new Date();
            genJob.error = { message: err.message, code: err.code || 'UNKNOWN' };
            await genJob.save();
            await publishJobStatus(genJob);
            // A failed generation produced no usable video — refund the quota
            // unit charged at submission time rather than letting it count
            // against the user's cap permanently (SRS: "Refund credits for
            // qualifying failures"). Idempotent — safe even if this handler
            // somehow ran twice for the same job.
            await refundGenerationUsage(genJob.owner, genJob._id, 'job_failed');
          }
        } catch (updateErr) {
          logger.error('Failed to persist job failure state', { error: updateErr.message });
        }
      }
    );
  });

  logger.info(`Generation worker started (concurrency=${env.resourceLimits.maxConcurrentJobs})`);

  const shutdown = async (signal) => {
    logger.info(`Worker received ${signal}, shutting down gracefully...`);
    await worker.close();
    await closeJobEventsPubSub();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Worker failed to start', { error: err.message });
  process.exit(1);
});
