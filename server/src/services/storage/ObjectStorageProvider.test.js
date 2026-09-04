import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ObjectStorageProvider } from './ObjectStorageProvider.js';

/**
 * Fake S3Client — records every command it receives and returns
 * caller-controlled responses, rather than hitting real AWS/R2/MinIO.
 * getSignedUrl() from @aws-sdk/s3-request-presigner reads
 * client.config.credentials/region internally in the real SDK, but since
 * we don't invoke it against a real client in these tests (network calls
 * aren't available in CI-less/offline environments), signed-URL tests are
 * limited to asserting the provider constructs and calls without throwing;
 * full presigned-URL correctness needs verification against real AWS/R2
 * credentials once dependencies are installed.
 */
function makeFakeClient({ getObjectBody } = {}) {
  const calls = [];
  return {
    calls,
    async send(command) {
      calls.push(command);
      const name = command.constructor.name;
      if (name === 'GetObjectCommand' && getObjectBody) {
        return { Body: getObjectBody() };
      }
      if (name === 'HeadObjectCommand') {
        return {};
      }
      return {};
    },
  };
}

function makeProvider(overrides = {}) {
  return new ObjectStorageProvider({
    bucket: 'test-bucket',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    client: makeFakeClient(overrides),
  });
}

test('ObjectStorageProvider: save() sends a PutObjectCommand with the sanitized key', async () => {
  const provider = makeProvider();
  const result = await provider.save(Buffer.from('hello'), 'videos/a/b.mp4');
  assert.equal(result.key, 'videos/a/b.mp4');
  assert.equal(result.sizeBytes, 5);
  assert.equal(provider.client.calls[0].constructor.name, 'PutObjectCommand');
  assert.equal(provider.client.calls[0].input.Bucket, 'test-bucket');
  assert.equal(provider.client.calls[0].input.Key, 'videos/a/b.mp4');
});

test('ObjectStorageProvider: rejects a path-traversal key', async () => {
  const provider = makeProvider();
  await assert.rejects(
    () => provider.save(Buffer.from('x'), '../../etc/passwd'),
    /resolves outside its prefix/
  );
});

test('ObjectStorageProvider: rejects an empty key', async () => {
  const provider = makeProvider();
  await assert.rejects(() => provider.save(Buffer.from('x'), ''));
});

test('ObjectStorageProvider: read() reassembles a Buffer from an async-iterable Body', async () => {
  async function* fakeBody() {
    yield Buffer.from('hel');
    yield Buffer.from('lo');
  }
  const provider = makeProvider({ getObjectBody: fakeBody });
  const buf = await provider.read('videos/a/b.mp4');
  assert.equal(buf.toString(), 'hello');
});

test('ObjectStorageProvider: delete() sends a DeleteObjectCommand for the sanitized key', async () => {
  const provider = makeProvider();
  await provider.delete('videos/a/b.mp4');
  assert.equal(provider.client.calls[0].constructor.name, 'DeleteObjectCommand');
  assert.equal(provider.client.calls[0].input.Key, 'videos/a/b.mp4');
});

test('ObjectStorageProvider: getUrl() falls back to an s3:// reference with no public base configured', () => {
  const provider = makeProvider();
  assert.equal(provider.getUrl('videos/a/b.mp4'), 's3://test-bucket/videos/a/b.mp4');
});

test('ObjectStorageProvider: saveFile() reads the source file and uploads its contents', async () => {
  const provider = makeProvider();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ostest-'));
  try {
    const sourcePath = path.join(tmpDir, 'source.bin');
    await fs.writeFile(sourcePath, Buffer.alloc(42, 7));
    const result = await provider.saveFile(sourcePath, 'videos/output.bin');
    assert.equal(result.sizeBytes, 42);
    assert.equal(provider.client.calls[0].input.Body.length, 42);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('ObjectStorageProvider: getLocalCopy() downloads the object to a temp file and returns its path', async () => {
  async function* fakeBody() {
    yield Buffer.from('image-bytes');
  }
  const provider = makeProvider({ getObjectBody: fakeBody });
  const localPath = await provider.getLocalCopy('uploads/u1/input.png');
  try {
    assert.ok(localPath.startsWith(os.tmpdir()));
    const contents = await fs.readFile(localPath);
    assert.equal(contents.toString(), 'image-bytes');
  } finally {
    await fs.rm(path.dirname(localPath), { recursive: true, force: true });
  }
});

test('ObjectStorageProvider: throws without a bucket or credentials', () => {
  assert.throws(() => new ObjectStorageProvider({ bucket: '', accessKeyId: 'x', secretAccessKey: 'y' }));
  assert.throws(() => new ObjectStorageProvider({ bucket: 'b', accessKeyId: '', secretAccessKey: 'y' }));
});
