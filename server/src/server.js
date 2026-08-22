import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { logger } from './utils/logger.js';
import { initSocketServer } from './realtime/socketServer.js';
import { closeJobEventsPubSub } from './realtime/jobEventsPubSub.js';
import { registerAllAdapters } from './services/adapters/registerAllAdapters.js';
import { listRegisteredAdapterKeys } from './services/adapters/adapterRegistry.js';
import './models/index.js'; // registers every Mongoose schema at startup

async function main() {
  try {
    await connectDatabase();
  } catch (err) {
    logger.error('Failed to connect to MongoDB at startup', { err: err.message });
    logger.warn('Server will continue starting; /api/v1/health will report the outage.');
  }

  // Registered here too (not just in workers/generation.worker.js) so admin
  // endpoints reporting "which adapters are actually available" (Phase 20)
  // reflect reality in the API process — registration itself is cheap and
  // GPU-independent; only an adapter's generate() call needs real hardware.
  registerAllAdapters();
  logger.info(`Registered adapters: ${listRegisteredAdapterKeys().join(', ')}`);

  const app = createApp();
  const server = http.createServer(app);

  // Real-time generation status (Phase 16). The API process only relays
  // events — it never writes job state itself; the worker process (a
  // separate Node process) is what actually processes jobs and publishes
  // status changes via Redis pub/sub (realtime/jobEventsPubSub.js).
  const io = initSocketServer(server);

  server.listen(env.port, () => {
    logger.info(`Server listening on port ${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    io.close();
    server.close(async () => {
      await closeJobEventsPubSub();
      await disconnectDatabase();
      logger.info('Shutdown complete.');
      process.exit(0);
    });
    // Force-exit if graceful shutdown hangs
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });
}

main();
