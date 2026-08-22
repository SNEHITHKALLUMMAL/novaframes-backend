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

  worker.on('failed', async (job, err) => {
    logger.error('Job failed', { jobId: job?.id, error: err.message, code: err.code });

    const isFinalAttempt = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!isFinalAttempt) return; // BullMQ will retry automatically per the backoff policy

    try {
      const genJob = await GenerationJob.findById(job.data.generationJobId);
      if (genJob && genJob.status !== JOB_STATUS.CANCELLED) {
        genJob.status = JOB_STATUS.FAILED;
        genJob.completedAt = new Date();
        genJob.error = { message: err.message, code: err.code || 'UNKNOWN' };
        await genJob.save();
        await publishJobStatus(genJob);
      }
    } catch (updateErr) {
      logger.error('Failed to persist job failure state', { error: updateErr.message });
    }
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
