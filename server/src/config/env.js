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
  },

  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'dev-stub',
    key: process.env.PAYMENT_KEY || '',
    secret: process.env.PAYMENT_SECRET || '',
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
 * Fails fast on startup rather than silently running with insecure
 * defaults in production — a real, common misconfiguration (deploying
 * with the placeholder JWT secrets from .env.example) would otherwise let
 * anyone forge valid access tokens. Only enforced when NODE_ENV=production;
 * local development keeps the convenience defaults.
 */
function assertProductionSecretsAreStrong() {
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

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with insecure secrets:\n  - ${problems.join('\n  - ')}\n` +
        'Set strong, unique values (32+ random characters) for these before deploying.'
    );
  }
}

assertProductionSecretsAreStrong();
