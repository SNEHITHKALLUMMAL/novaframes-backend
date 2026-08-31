import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFfmpegCommand } from './ffmpeg.js';

// Exercises the real spawn() wrapper against harmless, universally-available
// commands rather than ffmpeg itself — proves the promise/exit-code/timeout
// plumbing works correctly, independent of whether ffmpeg is installed in
// whatever environment eventually runs this suite.

test('runFfmpegCommand: resolves on exit code 0', async () => {
  const result = await runFfmpegCommand('true', []);
  assert.equal(result.code, 0);
});

test('runFfmpegCommand: rejects on non-zero exit code', async () => {
  await assert.rejects(() => runFfmpegCommand('false', []), /exited with code/);
});

test('runFfmpegCommand: rejects when the binary does not exist', async () => {
  await assert.rejects(() => runFfmpegCommand('this-binary-does-not-exist-anywhere', []));
});

test('runFfmpegCommand: rejects on timeout for a long-running process', async () => {
  await assert.rejects(
    () => runFfmpegCommand('sleep', ['5'], { timeoutMs: 200 }),
    /timed out/
  );
});

test('runFfmpegCommand: captures stderr in the rejection message on failure', async () => {
  try {
    await runFfmpegCommand('node', ['-e', 'console.error("custom failure reason"); process.exit(1)']);
    assert.fail('should have rejected');
  } catch (err) {
    assert.match(err.message, /custom failure reason/);
  }
});
