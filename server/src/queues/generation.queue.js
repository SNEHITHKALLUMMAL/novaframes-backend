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
      priority, // lower number = higher priority; used later for plan-based queue priority (Phase 18)
    }
  );
  return bullJob;
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
