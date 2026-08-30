import { isProduction } from '../config/env.js';
import { getRequestContext } from './requestContext.js';

/**
 * Minimal structured logger. Kept dependency-free by design for Phase 2;
 * swap the transport here later (e.g. pino/winston) without touching call sites.
 *
 * PHASE_17: every log line now automatically includes whatever's in the
 * current AsyncLocalStorage context (requestId, and once a worker job
 * picks it up, generationJobId) — see requestContext.js. Existing call
 * sites (`logger.info('message', { someField })`) don't need to change;
 * the context is merged in here, once, rather than requiring every
 * call site across the codebase to remember to pass requestId manually.
 */
function log(level, message, meta = {}) {
  const context = getRequestContext();
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...context,
    ...meta, // explicit meta wins over context on key collision
  };
  const extra = { ...context, ...meta };
  const line = isProduction
    ? JSON.stringify(entry)
    : `[${entry.time}] ${level.toUpperCase()} ${message}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
  debug: (message, meta) => {
    if (!isProduction) log('debug', message, meta);
  },
};
