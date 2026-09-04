import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import { createSanitizeMiddleware } from './middleware/sanitize.js';
import { requestContextMiddleware } from './utils/requestContext.js';
import { httpMetricsMiddleware, metricsHandler } from './observability/metrics.js';
import { ApiError } from './utils/ApiError.js';
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
  app.use(requestContextMiddleware); // first — every subsequent middleware/handler's logs should carry the request ID
  app.use(httpMetricsMiddleware);
  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
    })
  );

  // --- Parsers ---
  // Stripe (and most webhook signature schemes) require the exact raw
  // request body bytes to verify a signature — parsing it to JSON first
  // would break verification. This must be registered before the global
  // express.json() below; body-parser middleware no-ops on a body that's
  // already been parsed (req._body), so this only affects this one path.
  app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json', limit: '2mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  // NoSQL-injection / prototype-pollution sanitization (strips `$`- and
  // `.`-prefixed keys recursively from body/query/params). MUST run after
  // the body parsers above, not before — express-mongo-sanitize sanitizes
  // whatever is currently in req.body at the moment it runs; registered
  // before express.json() (as this was, until this phase), req.body is
  // still undefined when it executes, so it was silently sanitizing
  // nothing and every parsed request body reached route handlers
  // completely unsanitized. req.query/req.params were unaffected by the
  // bug (Express populates those before any custom middleware runs), but
  // req.body — the primary attack surface for POST/PATCH/PUT — was not
  // actually being protected by this middleware at all. Found during the
  // PHASE_05 security audit; fixed by moving it here, and skipped on the
  // webhook path specifically (its body is an intentionally-untouched raw
  // Buffer for signature verification, not a parsed object — sanitizing
  // it would be a no-op at best and a correctness risk at worst).
  app.use(createSanitizeMiddleware(mongoSanitize));

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

  // GET /metrics — Prometheus scrape endpoint. Deliberately outside
  // /api/v1 (not part of the product API, a separate operational
  // surface — standard Prometheus convention) and outside the global
  // apiLimiter (a scraper polling every 15-30s shouldn't compete with
  // product traffic for rate-limit budget). Token-gated rather than
  // open — see env.js's production guard requiring METRICS_TOKEN to be
  // set at all in production.
  app.get('/metrics', (req, res, next) => {
    if (env.metrics.token) {
      const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (provided !== env.metrics.token) {
        return next(ApiError.unauthorized('Invalid or missing metrics token'));
      }
    }
    metricsHandler(req, res).catch(next);
  });

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
