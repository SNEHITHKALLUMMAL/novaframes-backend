import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalStorageProvider } from './LocalStorageProvider.js';

// Uses a fresh temp directory per test run rather than the project's real
// storage/ folder, so this suite never leaves artifacts behind and can run
// repeatedly without cleanup drift.
async function makeProvider() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
  return { provider: new LocalStorageProvider(root), root };
}

test('LocalStorageProvider: save/read/delete round trip', async () => {
  const { provider, root } = await makeProvider();
  try {
    const { key, url, sizeBytes } = await provider.save(Buffer.from('hello world'), 'a/b/hello.txt');
    assert.equal(key, 'a/b/hello.txt');
    assert.equal(url, '/storage/a/b/hello.txt');
    assert.equal(sizeBytes, 11);

    const readBack = await provider.read('a/b/hello.txt');
    assert.equal(readBack.toString(), 'hello world');

    await provider.delete('a/b/hello.txt');
    await assert.rejects(() => provider.read('a/b/hello.txt'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('LocalStorageProvider: rejects a path-traversal key instead of silently rewriting it', async () => {
  const { provider, root } = await makeProvider();
  try {
    await assert.rejects(
      () => provider.save(Buffer.from('x'), '../../etc/passwd'),
      /resolves outside the storage root/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('LocalStorageProvider: rejects an empty key', async () => {
  const { provider, root } = await makeProvider();
  try {
    await assert.rejects(() => provider.save(Buffer.from('x'), ''));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('LocalStorageProvider: saveFile copies from a source path and reports correct size', async () => {
  const { provider, root } = await makeProvider();
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-src-'));
  try {
    const sourcePath = path.join(sourceDir, 'source.bin');
    await fs.writeFile(sourcePath, Buffer.alloc(1024, 1));

    const result = await provider.saveFile(sourcePath, 'videos/output.bin');
    assert.equal(result.sizeBytes, 1024);

    const stored = await provider.read('videos/output.bin');
    assert.equal(stored.length, 1024);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
});

test('LocalStorageProvider: getUrl produces a consistent forward-slash URL regardless of key nesting', async () => {
  const { provider, root } = await makeProvider();
  try {
    assert.equal(provider.getUrl('a/b/c.mp4'), '/storage/a/b/c.mp4');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
