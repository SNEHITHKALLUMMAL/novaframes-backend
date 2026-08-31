import mongoose from 'mongoose';

/**
 * Real-MongoDB integration test harness — deliberately NOT
 * mongodb-memory-server or any in-process fake. This project already has
 * a real MongoDB available in every environment that can run its tests:
 * docker-compose.yml (PHASE_19, converted to a single-node replica set in
 * PHASE_06 specifically so transactions work) and backend-ci.yml's Mongo
 * service container. Adding a second, different Mongo-simulation
 * mechanism just for tests would mean the thing being tested against
 * isn't the thing actually deployed — and mongodb-memory-server
 * specifically needs to download a real mongod binary on first use,
 * which doesn't remove the "needs network/infra access" problem, just
 * moves it. Connecting to a real instance you already run is simpler and
 * more honest about what's being verified.
 *
 * Every existing DB-dependent phase in this project (PHASE_06's
 * transaction work, PHASE_12's idempotent ledger, PHASE_13's webhook
 * idempotency, PHASE_08/09's retry logic) was implemented against
 * reasoning about MongoDB's real behavior but could only be verified by
 * `node --check` in the sandbox this was built in — this harness is what
 * closes that gap once a real MongoDB is reachable (which it always is,
 * in CI and in local dev via docker-compose).
 *
 * IMPORTANT: connects to a real database and calls dropDatabase() on
 * teardown — TEST_MONGODB_URI must point at a disposable test database,
 * never a real one. Defaults to a local db named distinctly from the
 * dev database precisely to make an accidental point-at-production
 * mistake harder (though the real safety net is you setting
 * TEST_MONGODB_URI correctly in CI/local .env.test — this default is a
 * convenience for local `npm test`, not a production safeguard).
 */

const TEST_MONGODB_URI =
  process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/ai_video_platform_test?replicaSet=rs0';

let connected = false;

/**
 * Call at the top of an integration test file's setup. Returns true if a
 * real MongoDB was reachable and the test can proceed, false if not —
 * callers should skip (not fail) their tests when this returns false, so
 * `npm test` still passes in an environment with no MongoDB running (a
 * quick local run without docker-compose up), while CI (which always has
 * one) gets full coverage.
 */
export async function connectTestDb() {
  if (connected) return true;
  try {
    await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 2000 });
    connected = true;
    return true;
  } catch {
    return false;
  }
}

/** Call in an `after()`/final test to leave no test data behind. */
export async function disconnectTestDb() {
  if (!connected) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  connected = false;
}

/** Call between tests (or between describe blocks) for a clean slate —
 * cheaper than reconnecting, since it reuses the open connection. */
export async function clearTestDb() {
  if (!connected) return;
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}
