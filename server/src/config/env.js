import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralized, validated environment configuration.
 * Every other module reads config from here — never from process.env directly.
 * This satisfies the SRS rule: "Do not hard-code these values throughout the application."
 */
function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),

  mongodbUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/ai_video_platform'),

  jwt: {
    secret: required('JWT_SECRET', 'dev-only-change-me'),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-only-change-me-refresh'),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    bucket: process.env.STORAGE_BUCKET || '',
    accessKey: process.env.STORAGE_ACCESS_KEY || '',
    secretKey: process.env.STORAGE_SECRET_KEY || '',
    localRoot: process.env.STORAGE_LOCAL_ROOT || 'storage',
    // Below only apply to STORAGE_PROVIDER=s3.
    region: process.env.STORAGE_REGION || 'auto',
    // Only needed for S3-compatible-but-not-AWS endpoints (Cloudflare R2,
    // Backblaze B2, MinIO, DigitalOcean Spaces). Leave unset for real AWS S3.
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    // MinIO and some self-hosted S3-compatible servers need path-style
    // URLs (bucket in the path, not a subdomain); AWS/R2/most others don't.
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
    // How long a generated read URL (video preview/download) stays valid.
    signedUrlExpirySeconds: Number(process.env.STORAGE_SIGNED_URL_EXPIRY || 3600),
    // Optional public CDN base (e.g. a CloudFront/R2-public-bucket domain)
    // for content that doesn't need per-request signing. Unset by default
    // — signed URLs are the safe default per the SRS's "secure media
    // access" requirement.
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL || '',
  },

  metrics: {
    // Optional shared-secret gate for GET /metrics — required in
    // production (see assertProductionConfigIsSafe below); Prometheus
    // scrape configs support a bearer_token, so this doesn't require
    // network-level access control to be safe to expose.
    token: process.env.METRICS_TOKEN || '',
  },

  email: {
    provider: process.env.EMAIL_PROVIDER || 'dev-stub',
    from: process.env.EMAIL_FROM || 'NovaFrame <no-reply@novaframe.example>',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
  },

  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'dev-stub',
    key: process.env.PAYMENT_KEY || '',
    secret: process.env.PAYMENT_SECRET || '',
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID || '',
      keySecret: process.env.RAZORPAY_KEY_SECRET || '',
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    },
    successUrl: process.env.PAYMENT_SUCCESS_URL || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?tab=billing&checkout=success`,
    cancelUrl: process.env.PAYMENT_CANCEL_URL || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?tab=billing&checkout=cancelled`,
  },

  replicate: {
    apiToken: process.env.REPLICATE_API_TOKEN || '',
    videoModelProvider: process.env.VIDEO_MODEL_PROVIDER || 'mock',
    t2vModel: process.env.REPLICATE_T2V_MODEL || 'wan-video/wan-2.2-t2v-fast',
    i2vModel: process.env.REPLICATE_I2V_MODEL || 'wan-video/wan-2.2-i2v-fast',
  },

  aiWorkerUrl: process.env.AI_WORKER_URL || 'http://127.0.0.1:6000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  wanAdapter: {
    // Off by default — enabling requires a real CUDA GPU, downloaded Wan
    // weights, and a working Python environment, none of which can be
    // assumed present. See ai-worker/README.md for setup before flipping
    // this on.
    enabled: process.env.WAN_ADAPTER_ENABLED === 'true',
    pythonBin: process.env.WAN_PYTHON_BIN || 'python3',
    scriptPath: process.env.WAN_SCRIPT_PATH || 'ai-worker/pipelines/wan_inference.py',
    modelPath: process.env.WAN_MODEL_PATH || '',
    device: process.env.WAN_DEVICE || 'cuda',
    inferenceTimeoutMs: Number(process.env.WAN_INFERENCE_TIMEOUT_MS || 20 * 60 * 1000),
  },

  resourceLimits: {
    maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS || 2),
    maxUploadSizeBytes: Number(process.env.MAX_UPLOAD_SIZE || 25 * 1024 * 1024),
    maxVideoDurationSeconds: Number(process.env.MAX_VIDEO_DURATION || 10),
    maxOutputResolution: process.env.MAX_OUTPUT_RESOLUTION || '1280x720',
    maxQueueSize: Number(process.env.MAX_QUEUE_SIZE || 100),
    jobTimeoutMs: Number(process.env.JOB_TIMEOUT || 5 * 60 * 1000),
    workerTimeoutMs: Number(process.env.WORKER_TIMEOUT || 6 * 60 * 1000),
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  },
};

export const isProduction = env.nodeEnv === 'production';

/**
 * Fails fast on startup rather than silently running with insecure or
 * incomplete production config — covers both the JWT-secrets check this
 * function started as, and the storage-provider check added alongside it
 * (misconfigurations that are equally dangerous: forged tokens, or silent
 * data loss on redeploy). Only enforced when NODE_ENV=production; local
 * development keeps the convenience defaults.
 */
function assertProductionConfigIsSafe() {
  if (!isProduction) return;

  const weakDefaults = ['dev-only-change-me', 'dev-only-change-me-refresh'];
  const problems = [];

  if (weakDefaults.includes(env.jwt.secret) || env.jwt.secret.length < 32) {
    problems.push('JWT_SECRET is missing, too short, or still the placeholder value');
  }
  if (weakDefaults.includes(env.jwt.refreshSecret) || env.jwt.refreshSecret.length < 32) {
    problems.push('JWT_REFRESH_SECRET is missing, too short, or still the placeholder value');
  }
  if (env.jwt.secret === env.jwt.refreshSecret) {
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must not be the same value');
  }

  // Render's filesystem is ephemeral — anything written to local disk is
  // lost on every redeploy/restart. Refuse to start in production on the
  // local provider rather than silently losing every generated video on
  // the next deploy (SRS: "Never store production media on ephemeral
  // server disks").
  if (env.storage.provider === 'local') {
    problems.push(
      'STORAGE_PROVIDER=local cannot be used in production — set STORAGE_PROVIDER=s3 ' +
        'with STORAGE_BUCKET/STORAGE_ACCESS_KEY/STORAGE_SECRET_KEY (see .env.example)'
    );
  }
  if (env.storage.provider === 's3' && (!env.storage.bucket || !env.storage.accessKey || !env.storage.secretKey)) {
    problems.push('STORAGE_PROVIDER=s3 requires STORAGE_BUCKET, STORAGE_ACCESS_KEY, and STORAGE_SECRET_KEY');
  }

  // Same reasoning as storage above: a dev-stub payment provider in
  // production would "succeed" every checkout without ever charging a
  // real card — silent revenue loss, not a security hole, but just as
  // much a case of "never use fake production implementations".
  if (env.payment.provider === 'dev-stub') {
    problems.push(
      'PAYMENT_PROVIDER=dev-stub cannot be used in production — set PAYMENT_PROVIDER=razorpay ' +
        'with RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET/RAZORPAY_WEBHOOK_SECRET (see .env.example)'
    );
  }
  if (env.payment.provider === 'razorpay' && (!env.payment.razorpay.keyId || !env.payment.razorpay.keySecret || !env.payment.razorpay.webhookSecret)) {
    problems.push('PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET');
  }

  // Same reasoning again: a dev-stub email provider in production would
  // "send" password reset and verification emails that never actually
  // reach anyone — a silent account-recovery outage, not a crash, so it's
  // exactly the kind of failure this startup check exists to catch early.
  if (env.email.provider === 'dev-stub') {
    problems.push(
      'EMAIL_PROVIDER=dev-stub cannot be used in production — set EMAIL_PROVIDER=smtp ' +
        'with SMTP_HOST/SMTP_USER/SMTP_PASS/EMAIL_FROM (see .env.example)'
    );
  }
  if (env.email.provider === 'smtp' && (!env.email.smtpHost || !env.email.smtpUser || !env.email.smtpPass)) {
    problems.push('EMAIL_PROVIDER=smtp requires SMTP_HOST, SMTP_USER, and SMTP_PASS');
  }

  // GET /metrics exposes request-rate/latency data (not sensitive
  // business data, but still not meant to be world-readable) — production
  // must set a token rather than leaving it open to anyone who finds the path.
  if (!env.metrics.token) {
    problems.push('METRICS_TOKEN is required in production (protects GET /metrics)');
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with unsafe configuration:\n  - ${problems.join('\n  - ')}\n` +
        'Fix these before deploying.'
    );
  }
}

assertProductionConfigIsSafe();

/**
 * Not gated by isProduction — unlike storage/payment/email, WAN_ADAPTER_
 * ENABLED can legitimately be flipped on in a non-production environment
 * too (a developer testing against a real local GPU). Either way, if
 * someone has enabled it, they clearly intend to actually use it, so
 * failing at startup (this check) beats failing at first-generation-
 * attempt time (WanAdapter.js#load(), much later, mid-job) — same
 * fail-fast reasoning as the production guards above, just not scoped to
 * production specifically.
 */
function assertWanAdapterConfigIsSafe() {
  if (env.wanAdapter.enabled && !env.wanAdapter.modelPath) {
    throw new Error(
      'WAN_ADAPTER_ENABLED=true requires WAN_MODEL_PATH to be set — see ai-worker/README.md'
    );
  }
}

assertWanAdapterConfigIsSafe();

/**
 * When VIDEO_MODEL_PROVIDER=replicate, validate that the required Replicate
 * environment variables are present. Fails fast at startup rather than
 * failing at first generation attempt.
 */
function assertReplicateConfigIsSafe() {
  if (env.replicate.videoModelProvider !== 'replicate') return;

  const problems = [];
  if (!env.replicate.apiToken) {
    problems.push('REPLICATE_API_TOKEN is required when VIDEO_MODEL_PROVIDER=replicate');
  }
  if (!env.replicate.t2vModel) {
    problems.push('REPLICATE_T2V_MODEL is required when VIDEO_MODEL_PROVIDER=replicate');
  }
  if (!env.replicate.i2vModel) {
    problems.push('REPLICATE_I2V_MODEL is required when VIDEO_MODEL_PROVIDER=replicate');
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start with VIDEO_MODEL_PROVIDER=replicate but missing config:\n  - ${problems.join('\n  - ')}\n` +
        'Set the required environment variables before deploying.'
    );
  }

  // Never log the actual token — just confirm it's present.
  console.log('[replicate] Configuration validated', {
    provider: 'replicate',
    t2vModel: env.replicate.t2vModel,
    i2vModel: env.replicate.i2vModel,
  });
}

assertReplicateConfigIsSafe();
