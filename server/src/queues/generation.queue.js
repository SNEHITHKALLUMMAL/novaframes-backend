import { Queue } from 'bullmq';
import { getRedisConnection } from '../config/redis.js';

export const GENERATION_QUEUE_NAME = 'generation';

let queue = null;

function getQueue() {
  queue ??= new Queue(GENERATION_QUEUE_NAME, { connection: getRedisConnection() });
  return queue;
}

/**
 * Enqueues a generation job. jobId is set to the GenerationJob's own Mongo
 * _id (as a string) so the two records stay trivially linked — no separate
 * mapping table needed to go from a BullMQ job back to its Mongo document
 * or vice versa.
 */
export async function enqueueGenerationJob(generationJobId, { priority } = {}) {
  const bullJob = await getQueue().add(
    'generate',
    { generationJobId },
    {
      jobId: generationJobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 60 * 60 * 24 }, // 24h — Mongo is the durable record, this is just Redis housekeeping
      removeOnFail: { age: 60 * 60 * 24 * 7 },
      priority, // lower number = higher priority — plan-based, see generation.service.js#createGenerationJob (PHASE_08)
    }
  );
  return bullJob;
}

/**
 * Exposed specifically for scripts/recover-orphaned-jobs.js (PHASE_26) —
 * "does a BullMQ job still exist for this generation" is exactly what a
 * Redis-data-loss recovery check needs to ask, without that script
 * needing its own direct BullMQ Queue instance (which would risk two
 * separate Queue objects/connections existing for the same queue name).
 */
export async function getBullJob(generationJobId) {
  return getQueue().getJob(generationJobId);
}

export async function cancelQueuedBullJob(generationJobId) {
  const bullJob = await getQueue().getJob(generationJobId);
  if (!bullJob) return false;

  const state = await bullJob.getState();
  if (state === 'waiting' || state === 'delayed' || state === 'prioritized') {
    await bullJob.remove();
    return true;
  }
  return false; // already active/completed/failed — caller decides how to handle
}

export async function getQueueCounts() {
  return getQueue().getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
}

export async function getQueuePosition(generationJobId) {
  const bullJob = await getQueue().getJob(generationJobId);
  if (!bullJob) return null;
  const waiting = await getQueue().getWaiting(0, 1000);
  const index = waiting.findIndex((j) => j.id === generationJobId);
  return index === -1 ? null : index + 1;
}
