import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let connection = null;

/**
 * Returns a shared ioredis connection. BullMQ requires maxRetriesPerRequest: null
 * on connections it manages, so this is dedicated to queue usage.
 */
export function getRedisConnection() {
  if (connection) return connection;

  connection = new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  connection.on('connect', () => logger.info('Redis connected'));
  connection.on('error', (err) => logger.error('Redis connection error', { err: err.message }));

  return connection;
}

export async function closeRedisConnection() {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
