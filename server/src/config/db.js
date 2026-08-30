import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

export async function connectDatabase() {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { err: err.message }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 8000,
    // Explicit rather than relying on the driver default (100) — a
    // production-safe pool size should be sized against Atlas's
    // connection limit divided by the number of API instances that will
    // run concurrently, not left as an implicit default that silently
    // changes behavior on a driver upgrade. 20 is a reasonable starting
    // point for a modest number of Render instances against a shared
    // Atlas tier; revisit alongside actual instance-count/tier decisions
    // in PHASE_22 (Render deployment) rather than guessing further here.
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 2),
  });

  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

export function getDatabaseState() {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] ?? 'unknown';
}
