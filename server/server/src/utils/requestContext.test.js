import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRequestContext, runWithContext, requestContextMiddleware } from './requestContext.js';

test('requestContext: getRequestContext() returns empty object outside any context', () => {
  assert.deepEqual(getRequestContext(), {});
});

test('requestContext: runWithContext() makes the context available inside the callback', () => {
  runWithContext({ requestId: 'abc-123' }, () => {
    assert.deepEqual(getRequestContext(), { requestId: 'abc-123' });
  });
});

test('requestContext: context is isolated between separate runWithContext calls', () => {
  runWithContext({ requestId: 'first' }, () => {
    assert.equal(getRequestContext().requestId, 'first');
  });
  runWithContext({ requestId: 'second' }, () => {
    assert.equal(getRequestContext().requestId, 'second');
  });
  assert.deepEqual(getRequestContext(), {});
});

test('requestContext: context survives across an await inside the callback', async () => {
  await runWithContext({ requestId: 'async-test' }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(getRequestContext().requestId, 'async-test');
  });
});

test('requestContextMiddleware: generates a UUID when no X-Request-Id header is present', () => {
  const req = { headers: {} };
  const headers = {};
  const res = { setHeader: (key, value) => (headers[key] = value) };
  let contextInsideNext = null;

  requestContextMiddleware(req, res, () => {
    contextInsideNext = getRequestContext();
  });

  assert.ok(req.id);
  assert.equal(headers['X-Request-Id'], req.id);
  assert.equal(contextInsideNext.requestId, req.id);
});

test('requestContextMiddleware: reuses an incoming X-Request-Id header rather than generating a new one', () => {
  const req = { headers: { 'x-request-id': 'upstream-id-789' } };
  const res = { setHeader: () => {} };

  requestContextMiddleware(req, res, () => {});

  assert.equal(req.id, 'upstream-id-789');
});
