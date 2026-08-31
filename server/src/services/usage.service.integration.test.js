import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearTestDb } from '../test-utils/db.js';
import { Subscription } from '../models/Subscription.model.js';
import { UsageLedgerEntry } from '../models/UsageLedgerEntry.model.js';
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUS } from '../constants/enums.js';
import { chargeGenerationUsage, refundGenerationUsage, getMyUsage } from './usage.service.js';

/**
 * Real-MongoDB integration test for the exact guarantee PHASE_12 built
 * and could only reason about, not verify, in the sandbox that wrote it:
 * the unique (generationJob, type) index is what actually prevents
 * double-charging, and the $group aggregation is what actually computes
 * net usage. Neither of those is testable with a fake/mocked Mongo client
 * — this is precisely the class of test the DB-integration-test-harness
 * gap (flagged since PHASE_12) was blocking.
 *
 * Skips (not fails) if no real MongoDB is reachable — see test-utils/db.js.
 */

let dbAvailable = false;
let testUserId;

before(async () => {
  dbAvailable = await connectTestDb();
});

after(async () => {
  if (dbAvailable) await disconnectTestDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearTestDb();
  testUserId = new mongoose.Types.ObjectId();
  await Subscription.create({
    user: testUserId,
    plan: SUBSCRIPTION_PLANS.FREE,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    currentPeriodStart: new Date('2026-01-01'),
    currentPeriodEnd: new Date('2026-02-01'),
  });
});

test('usage ledger (integration): a charge increases generationsUsed by 1', async (t) => {
  if (!dbAvailable) return t.skip('no MongoDB reachable — see test-utils/db.js');

  const jobId = new mongoose.Types.ObjectId();
  await chargeGenerationUsage(testUserId, jobId);

  const usage = await getMyUsage(testUserId);
  assert.equal(usage.generationsUsed, 1);
});

test('usage ledger (integration): calling chargeGenerationUsage twice for the SAME job only charges once', async (t) => {
  if (!dbAvailable) return t.skip('no MongoDB reachable — see test-utils/db.js');

  const jobId = new mongoose.Types.ObjectId();
  await chargeGenerationUsage(testUserId, jobId);
  await chargeGenerationUsage(testUserId, jobId); // simulates a retry/race — must be a no-op

  const usage = await getMyUsage(testUserId);
  assert.equal(usage.generationsUsed, 1, 'duplicate charge for the same job must not double-count');

  const entries = await UsageLedgerEntry.find({ generationJob: jobId, type: 'charge' });
  assert.equal(entries.length, 1, 'only one charge document should exist for this job, enforced by the unique index');
});

test('usage ledger (integration): a refund cancels out its matching charge', async (t) => {
  if (!dbAvailable) return t.skip('no MongoDB reachable — see test-utils/db.js');

  const jobId = new mongoose.Types.ObjectId();
  await chargeGenerationUsage(testUserId, jobId);
  await refundGenerationUsage(testUserId, jobId, 'job_failed');

  const usage = await getMyUsage(testUserId);
  assert.equal(usage.generationsUsed, 0, 'a charge + its refund should net to zero');
});

test('usage ledger (integration): duplicate refund for the same job is also a no-op', async (t) => {
  if (!dbAvailable) return t.skip('no MongoDB reachable — see test-utils/db.js');

  const jobId = new mongoose.Types.ObjectId();
  await chargeGenerationUsage(testUserId, jobId);
  await refundGenerationUsage(testUserId, jobId, 'job_failed');
  await refundGenerationUsage(testUserId, jobId, 'job_failed'); // duplicate — must not go negative

  const usage = await getMyUsage(testUserId);
  assert.equal(usage.generationsUsed, 0, 'a duplicate refund must not push usage below zero');
});

test('usage ledger (integration): usage from a different period is not counted', async (t) => {
  if (!dbAvailable) return t.skip('no MongoDB reachable — see test-utils/db.js');

  // Directly insert an entry for a different (older) period than the
  // subscription's current one, bypassing chargeGenerationUsage (which
  // always uses the CURRENT period) specifically to prove the period
  // filter in sumLedgerForPeriod actually excludes it.
  await UsageLedgerEntry.create({
    user: testUserId,
    generationJob: new mongoose.Types.ObjectId(),
    type: 'charge',
    amount: 1,
    periodStart: new Date('2025-01-01'), // a full year before the active subscription's period
    reason: 'job_submitted',
  });

  const usage = await getMyUsage(testUserId);
  assert.equal(usage.generationsUsed, 0, 'entries outside the current billing period must not count');
});
