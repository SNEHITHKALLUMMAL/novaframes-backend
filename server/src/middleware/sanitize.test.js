import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSanitizeMiddleware } from './sanitize.js';

function fakeSanitizeFactory(calls) {
  // Mimics express-mongo-sanitize's shape: a factory that returns Express
  // middleware, so createSanitizeMiddleware can call sanitizeFn() the same
  // way it calls the real mongoSanitize().
  return () => (req, res, next) => {
    calls.push(req.body);
    next();
  };
}

test('sanitize middleware: calls the sanitizer for a normal parsed JSON body', () => {
  const calls = [];
  const middleware = createSanitizeMiddleware(fakeSanitizeFactory(calls));
  const req = { body: { email: 'a@example.com' } };
  let nextCalled = false;

  middleware(req, {}, () => {
    nextCalled = true;
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { email: 'a@example.com' });
  assert.equal(nextCalled, true);
});

test('sanitize middleware: skips the sanitizer entirely for a raw Buffer body (the webhook route)', () => {
  const calls = [];
  const middleware = createSanitizeMiddleware(fakeSanitizeFactory(calls));
  const req = { body: Buffer.from('{"type":"checkout.session.completed"}') };
  let nextCalled = false;

  middleware(req, {}, () => {
    nextCalled = true;
  });

  assert.equal(calls.length, 0, 'sanitizer must never be called on a Buffer body');
  assert.equal(nextCalled, true, 'must still call next() so the request proceeds');
});

test('sanitize middleware: runs for an empty/undefined body (still passes through to the real sanitizer, not a Buffer)', () => {
  const calls = [];
  const middleware = createSanitizeMiddleware(fakeSanitizeFactory(calls));
  const req = { body: undefined };

  middleware(req, {}, () => {});

  assert.equal(calls.length, 1);
});
