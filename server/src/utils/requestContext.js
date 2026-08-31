import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Lets logger.js automatically attach a requestId (and, once known, a
 * generationJobId) to every log line written during a request or a
 * worker job — without every call site needing to manually pass
 * `{ requestId }` as a third argument. This is what makes "correlate
 * logs across API → queue → worker" (SRS PHASE_17) actually usable: grep
 * one ID and see the whole story, not just the API-layer half of it.
 *
 * Used two ways:
 *  - HTTP layer: requestContextMiddleware (below) wraps each request.
 *  - Worker layer: generation.worker.js wraps each job's processing in
 *    runWithContext({ requestId: <the id captured at job creation>,
 *    generationJobId }) so its own log lines carry the SAME requestId the
 *    original API call that created the job used — the actual
 *    cross-service correlation, not just two separately-scoped ID spaces.
 */
const asyncLocalStorage = new AsyncLocalStorage();

export function getRequestContext() {
  return asyncLocalStorage.getStore() ?? {};
}

export function runWithContext(context, fn) {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Accepts a caller-supplied X-Request-Id (useful when a load balancer or
 * an API gateway already generates one upstream) or generates a fresh
 * UUID. Always echoed back in the response header so a client/support
 * ticket can reference the exact ID this request's logs will contain.
 */
export function requestContextMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  runWithContext({ requestId }, next);
}
