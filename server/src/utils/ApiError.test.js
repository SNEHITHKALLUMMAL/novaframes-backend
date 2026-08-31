import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from './ApiError.js';

test('ApiError: badRequest sets status 400 and is operational', () => {
  const err = ApiError.badRequest('bad input', [{ field: 'x', message: 'required' }]);
  assert.equal(err.statusCode, 400);
  assert.equal(err.message, 'bad input');
  assert.deepEqual(err.errors, [{ field: 'x', message: 'required' }]);
  assert.equal(err.isOperational, true);
});

test('ApiError: unauthorized defaults to a sensible message', () => {
  const err = ApiError.unauthorized();
  assert.equal(err.statusCode, 401);
  assert.equal(err.message, 'Unauthorized');
});

test('ApiError: notFound, conflict, forbidden, tooManyRequests, locked map to correct codes', () => {
  assert.equal(ApiError.notFound().statusCode, 404);
  assert.equal(ApiError.conflict().statusCode, 409);
  assert.equal(ApiError.forbidden().statusCode, 403);
  assert.equal(ApiError.tooManyRequests().statusCode, 429);
  assert.equal(ApiError.locked().statusCode, 423);
});

test('ApiError: internal() is marked non-operational (unexpected server error)', () => {
  const err = ApiError.internal();
  assert.equal(err.statusCode, 500);
  assert.equal(err.isOperational, false);
});

test('ApiError: is a real Error instance (works with try/catch and instanceof)', () => {
  const err = ApiError.badRequest('x');
  assert.ok(err instanceof Error);
  assert.ok(err instanceof ApiError);
  assert.equal(err.name, 'ApiError');
});
