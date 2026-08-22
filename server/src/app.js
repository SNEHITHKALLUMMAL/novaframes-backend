import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import path from 'node:path';

import { env, isProduction } from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import v1Router from './routes/v1/index.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();

  // Trust proxy (needed for correct rate-limiting / secure cookies behind a reverse proxy in prod)
  app.set('trust proxy', 1);

  // --- Security middleware ---
  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
    })
  );
  app.use(mongoSanitize());

  // --- Parsers ---
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  // --- Logging ---
  app.use(
    morgan(isProduction ? 'combined' : 'dev', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    })
  );

  // --- Rate limiting (applied globally; stricter limiter added per-route in auth phase) ---
  app.use('/api', apiLimiter);

  // --- Routes ---
  app.use('/api/v1', v1Router);

  // --- Local-storage static serving (dev only) ---
  // Only meaningful when STORAGE_PROVIDER=local. This serves generated
  // videos/thumbnails/uploads directly with no access control — acceptable
  // for local development, NOT for production. A production deployment on
  // an S3-compatible StorageProvider serves signed, time-limited URLs
  // instead of this route (see docs/QUEUE_INFRASTRUCTURE.md / storage
  // abstraction notes) — "Implement secure file access" per the SRS.
  if (env.storage.provider === 'local') {
    app.use(
      '/storage',
      // Helmet's default Cross-Origin-Resource-Policy is 'same-origin',
      // which would block <video>/<img> tags from loading these files if
      // the frontend is ever served from a different origin than the API
      // (common in production — e.g. a CDN-fronted SPA calling a separate
      // API host). Relaxed to 'cross-origin' for this route only — it's
      // public read-only media, not sensitive data, so this is a
      // deliberate, scoped trade-off, not a blanket policy change.
      (req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
      },
      express.static(path.resolve(process.cwd(), env.storage.localRoot))
    );
  }

  // --- 404 + centralized error handling (must be last) ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
