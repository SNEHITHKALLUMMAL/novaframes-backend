import { isProduction } from '../config/env.js';

/**
 * Minimal structured logger. Kept dependency-free by design for Phase 2;
 * swap the transport here later (e.g. pino/winston) without touching call sites.
 */
function log(level, message, meta = {}) {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...meta,
  };
  const line = isProduction ? JSON.stringify(entry) : `[${entry.time}] ${level.toUpperCase()} ${message}${Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''}`;

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
