import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const CHANNEL = 'generation-job-events';

/**
 * The worker process (workers/generation.worker.js) and the API process
 * (server.js, where Socket.IO lives) are two separate Node processes —
 * that separation is deliberate (Phase 1 architecture). Redis pub/sub is
 * the bridge: the worker publishes a job-status event whenever it changes
 * a GenerationJob's state, and the API process subscribes and re-emits it
 * over Socket.IO to the owning user's room. Neither process needs to know
 * the other exists beyond this one channel.
 *
 * Publish and subscribe each need their OWN Redis connection — a
 * connection in subscribe mode can't issue other commands, so these are
 * deliberately separate from the shared BullMQ connection in config/redis.js.
 */

let publisherConnection = null;
let subscriberConnection = null;

function getPublisher() {
  publisherConnection ??= new Redis(env.redisUrl);
  return publisherConnection;
}

export async function publishJobEvent(event) {
  await getPublisher().publish(CHANNEL, JSON.stringify(event));
}

export function subscribeToJobEvents(handler) {
  subscriberConnection ??= new Redis(env.redisUrl);
  subscriberConnection.subscribe(CHANNEL, (err) => {
    if (err) logger.error('Failed to subscribe to job events channel', { error: err.message });
  });
  subscriberConnection.on('message', (channel, message) => {
    if (channel !== CHANNEL) return;
    try {
      handler(JSON.parse(message));
    } catch (err) {
      logger.warn('Failed to handle job event message', { error: err.message });
    }
  });
  return subscriberConnection;
}

export async function closeJobEventsPubSub() {
  await Promise.all([publisherConnection?.quit(), subscriberConnection?.quit()].filter(Boolean));
  publisherConnection = null;
  subscriberConnection = null;
}
