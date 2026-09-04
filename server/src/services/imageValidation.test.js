import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateImageMetadata } from './imageValidation.js';
import { ApiError } from '../utils/ApiError.js';

test('imageValidation: accepts a valid JPEG within dimension bounds', () => {
  const result = validateImageMetadata({ format: 'jpeg', width: 512, height: 512 });
  assert.equal(result.format, 'jpeg');
  assert.equal(result.extension, 'jpg');
  assert.equal(result.mimeType, 'image/jpeg');
});

test('imageValidation: accepts PNG and WebP too', () => {
  assert.equal(validateImageMetadata({ format: 'png', width: 100, height: 100 }).mimeType, 'image/png');
  assert.equal(validateImageMetadata({ format: 'webp', width: 100, height: 100 }).mimeType, 'image/webp');
});

test('imageValidation: rejects an unsupported format (e.g. gif)', () => {
  assert.throws(
    () => validateImageMetadata({ format: 'gif', width: 100, height: 100 }),
    (err) => err instanceof ApiError && err.statusCode === 400
  );
});

test('imageValidation: rejects missing/undefined format (what a non-image buffer produces)', () => {
  assert.throws(
    () => validateImageMetadata({ format: undefined, width: undefined, height: undefined }),
    (err) => err instanceof ApiError && err.statusCode === 400
  );
});

test('imageValidation: rejects images below the minimum dimension', () => {
  assert.throws(
    () => validateImageMetadata({ format: 'png', width: 10, height: 10 }),
    (err) => err instanceof ApiError && err.statusCode === 400
  );
});

test('imageValidation: rejects images above the maximum dimension', () => {
  assert.throws(
    () => validateImageMetadata({ format: 'png', width: 5000, height: 5000 }),
    (err) => err instanceof ApiError && err.statusCode === 400
  );
});

test('imageValidation: accepts exactly at the boundary values', () => {
  assert.doesNotThrow(() => validateImageMetadata({ format: 'png', width: 64, height: 64 }));
  assert.doesNotThrow(() => validateImageMetadata({ format: 'png', width: 4096, height: 4096 }));
});

test('imageValidation: rejects one pixel outside each boundary', () => {
  assert.throws(() => validateImageMetadata({ format: 'png', width: 63, height: 64 }));
  assert.throws(() => validateImageMetadata({ format: 'png', width: 4097, height: 4096 }));
});
