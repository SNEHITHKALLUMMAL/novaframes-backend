import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addInterval } from './dateMath.js';

test('addInterval: normal mid-month date, monthly', () => {
  const result = addInterval(new Date('2026-03-15T00:00:00Z'), 'monthly');
  assert.equal(result.toISOString(), '2026-04-15T00:00:00.000Z');
});

test('addInterval: Jan 31 + 1 month clamps to Feb 28 (non-leap year)', () => {
  const result = addInterval(new Date('2026-01-31T00:00:00Z'), 'monthly');
  assert.equal(result.toISOString(), '2026-02-28T00:00:00.000Z');
});

test('addInterval: Jan 31 + 1 year lands on Jan 31 (no overflow)', () => {
  const result = addInterval(new Date('2026-01-31T00:00:00Z'), 'yearly');
  assert.equal(result.toISOString(), '2027-01-31T00:00:00.000Z');
});

test('addInterval: leap day + 1 year clamps to Feb 28', () => {
  const result = addInterval(new Date('2024-02-29T00:00:00Z'), 'yearly');
  assert.equal(result.toISOString(), '2025-02-28T00:00:00.000Z');
});

test('addInterval: Jan 31 + 1 month in a leap year still clamps correctly (Feb 29)', () => {
  const result = addInterval(new Date('2024-01-31T00:00:00Z'), 'monthly');
  assert.equal(result.toISOString(), '2024-02-29T00:00:00.000Z');
});

test('addInterval: defaults to monthly for any billingCycle other than "yearly"', () => {
  const result = addInterval(new Date('2026-06-01T00:00:00Z'), 'something-else');
  assert.equal(result.toISOString(), '2026-07-01T00:00:00.000Z');
});
