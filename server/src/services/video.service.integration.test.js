import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearTestDb } from '../test-utils/db.js';
import { Video } from '../models/Video.model.js';
import { getOwnedVideo } from './video.service.js';

/**
 * Real-MongoDB integration test for the IDOR/authorization-bypass
 * boundary (SRS's explicit security_tests list). assertOwned()
 * (utils/ownership.js, PHASE_02) is pure logic and already unit-tested in
 * isolation, but "does the real Mongoose query + real ApiError actually
 * stop user B from fetching user A's video" is an integration behavior —
 * exactly the class of test the DB-integration-test-harness gap
 * (PHASE_12) was blocking. Skips (not fails) if no real MongoDB is
 * reachable — see test-utils/db.js.
 */

let dbAvailable = false;
let ownerId;
let otherUserId;
let videoId;

before(async () => {
  dbAvailable = await connectTestDb();
});

after(async () => {
  if (dbAvailable) await disconnectTestDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await clearTestDb();
  ownerId = new mongoose.Types.ObjectId();
  otherUserId = new mongoose.Types.ObjectId();
  const video = await Video.create({
    owner: ownerId,
    generationJob: new mongoose.Types.ObjectId(),
    aiModel: new mongoose.Types.ObjectId(),
    title: 'Owner-only test video',
    type: 'text-to-video',
    status: 'ready',
    fileKey: 'videos/owner/test.mp4',
  });
  videoId = video._id;
});

test('video ownership (integration): the owner can fetch their own video', async (t) => {
  if (!dbAvailable) return t.skip('no MongoDB reachable — see test-utils/db.js');

  const video = await getOwnedVideo(ownerId, videoId);
  assert.equal(video._id.toString(), videoId.toString());
});

test('video ownership (integration): a different user gets a 404, not the video (IDOR prevention)', async (t) => {
  if (!dbAvailable) return t.skip('no MongoDB reachable — see test-utils/db.js');

  await assert.rejects(
    () => getOwnedVideo(otherUserId, videoId),
    (err) => {
      // Specifically checking this is a 404 (ApiError.notFound), not a
      // 403 — the whole point of PHASE_02's assertOwned() is that a
      // non-owner can't distinguish "doesn't exist" from "exists but
      // isn't yours". A 403 here would itself be an information leak.
      assert.equal(err.statusCode, 404);
      return true;
    }
  );
});

test('video ownership (integration): a non-existent video ID also gets a 404 (same response shape as the IDOR case)', async (t) => {
  if (!dbAvailable) return t.skip('no MongoDB reachable — see test-utils/db.js');

  const fakeId = new mongoose.Types.ObjectId();
  await assert.rejects(
    () => getOwnedVideo(ownerId, fakeId),
    (err) => {
      assert.equal(err.statusCode, 404);
      return true;
    }
  );
});
