/**
 * REQUIRES npm install (zod) — not runnable in this sandbox (no network
 * access to install packages). Written and reviewed against the actual
 * schemas in generation.validator.js; run as one of the first things after
 * `npm install` locally to confirm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationJobSchema, listGenerationJobsQuerySchema } from './generation.validator.js';

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

test('createGenerationJobSchema: accepts a minimal valid text-to-video payload', () => {
  const result = createGenerationJobSchema.safeParse({
    type: 'text-to-video',
    aiModelId: VALID_OBJECT_ID,
  });
  assert.equal(result.success, true);
  // Defaults applied for everything not provided
  assert.equal(result.data.prompt, '');
  assert.deepEqual(result.data.inputFileIds, []);
});

test('createGenerationJobSchema: rejects an invalid generation type', () => {
  const result = createGenerationJobSchema.safeParse({
    type: 'not-a-real-type',
    aiModelId: VALID_OBJECT_ID,
  });
  assert.equal(result.success, false);
});

test('createGenerationJobSchema: rejects a malformed ObjectId', () => {
  const result = createGenerationJobSchema.safeParse({
    type: 'text-to-video',
    aiModelId: 'not-a-valid-object-id',
  });
  assert.equal(result.success, false);
});

test('createGenerationJobSchema: rejects more than 4 input files', () => {
  const result = createGenerationJobSchema.safeParse({
    type: 'image-to-video',
    aiModelId: VALID_OBJECT_ID,
    inputFileIds: Array(5).fill(VALID_OBJECT_ID),
  });
  assert.equal(result.success, false);
});

test('createGenerationJobSchema: accepts exactly 4 input files', () => {
  const result = createGenerationJobSchema.safeParse({
    type: 'image-to-video',
    aiModelId: VALID_OBJECT_ID,
    inputFileIds: Array(4).fill(VALID_OBJECT_ID),
  });
  assert.equal(result.success, true);
});

test('createGenerationJobSchema: rejects a prompt over 2000 characters', () => {
  const result = createGenerationJobSchema.safeParse({
    type: 'text-to-video',
    aiModelId: VALID_OBJECT_ID,
    prompt: 'x'.repeat(2001),
  });
  assert.equal(result.success, false);
});

test('createGenerationJobSchema: projectId is optional and nullable', () => {
  assert.equal(
    createGenerationJobSchema.safeParse({ type: 'text-to-video', aiModelId: VALID_OBJECT_ID }).success,
    true
  );
  assert.equal(
    createGenerationJobSchema.safeParse({
      type: 'text-to-video',
      aiModelId: VALID_OBJECT_ID,
      projectId: null,
    }).success,
    true
  );
});

test('listGenerationJobsQuerySchema: defaults page to 1 and limit to 20', () => {
  const result = listGenerationJobsQuerySchema.safeParse({});
  assert.equal(result.data.page, 1);
  assert.equal(result.data.limit, 20);
});

test('listGenerationJobsQuerySchema: coerces string query values to numbers', () => {
  const result = listGenerationJobsQuerySchema.safeParse({ page: '3', limit: '10' });
  assert.equal(result.success, true);
  assert.equal(result.data.page, 3);
  assert.equal(result.data.limit, 10);
});

test('listGenerationJobsQuerySchema: rejects a limit above 50', () => {
  const result = listGenerationJobsQuerySchema.safeParse({ limit: '51' });
  assert.equal(result.success, false);
});

test('listGenerationJobsQuerySchema: rejects an invalid status value', () => {
  const result = listGenerationJobsQuerySchema.safeParse({ status: 'NOT_A_REAL_STATUS' });
  assert.equal(result.success, false);
});
