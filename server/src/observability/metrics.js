import client from 'prom-client';
import { GenerationJob } from '../models/GenerationJob.model.js';
import { JOB_STATUS } from '../constants/enums.js';
import { getQueueCounts } from '../queues/generation.queue.js';

/**
 * SRS PHASE_17 "required_metrics" — covers API latency/error rate and
 * queue depth/generation success-failure rate from that list.
 * Deliberately does NOT include GPU utilization/memory — same reasoning
 * adminOverview.service.js already documented: there's no live
 * GPU/worker registry to report on truthfully in this codebase, and
 * fabricating plausible-looking numbers would be exactly the fake-data
 * problem the project's own rules forbid. Add real GPU metrics once
 * PHASE_10's Wan worker actually reports them (e.g. via nvidia-smi or a
 * DCGM exporter sidecar on the GPU host) rather than faking them here.
 */

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry }); // Node process metrics (event loop lag, memory, GC) — free, standard practice

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

/**
 * Registered but updated at SCRAPE time (in the /metrics handler below),
 * not incremented at every job-status-change call site throughout the
 * codebase. This is a deliberate, smaller-footprint choice: queue depth
 * and job counts by status are already cheap, correct aggregate queries
 * (BullMQ's own counts; a Mongo count grouped by status) — recomputing
 * them once per scrape is simpler and less invasive than threading
 * metric-increment calls through generation.service.js and the worker,
 * and can't drift out of sync with the database the way manually
 * incremented counters could.
 */
const queueDepthGauge = new client.Gauge({
  name: 'generation_queue_depth',
  help: 'Current BullMQ queue depth by state',
  labelNames: ['state'],
  registers: [registry],
});

const generationJobsGauge = new client.Gauge({
  name: 'generation_jobs_total',
  help: 'Total generation jobs by status (all-time count, not a rate)',
  labelNames: ['status'],
  registers: [registry],
});

async function refreshScrapeTimeGauges() {
  const [queueCounts, jobStatusAgg] = await Promise.all([
    getQueueCounts(),
    GenerationJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  for (const [state, count] of Object.entries(queueCounts)) {
    queueDepthGauge.set({ state }, count);
  }

  const counts = Object.fromEntries(Object.values(JOB_STATUS).map((s) => [s, 0]));
  for (const { _id, count } of jobStatusAgg) {
    if (_id in counts) counts[_id] = count;
  }
  for (const [status, count] of Object.entries(counts)) {
    generationJobsGauge.set({ status }, count);
  }
}

/**
 * Express middleware — records every request's duration/status into the
 * histogram/counter above. Uses the matched route pattern (req.route,
 * e.g. '/videos/:id'), not the raw URL, so metric cardinality stays
 * bounded (a raw URL with a different ID per request would create a new
 * time series per request — a classic Prometheus cardinality mistake).
 */
export function httpMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestsTotal.inc(labels);
  });
  next();
}

/**
 * Express handler for GET /metrics. Refreshes the scrape-time gauges
 * first so a scrape always reflects current state, not whatever the
 * last scrape (potentially minutes ago) happened to see.
 */
export async function metricsHandler(req, res) {
  await refreshScrapeTimeGauges();
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}
