import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlanDefinition, listPlanDefinitions, PLAN_DEFINITIONS } from './plans.js';

test('plans: exactly free, pro, unlimited exist', () => {
  const ids = listPlanDefinitions().map((p) => p.id).sort();
  assert.deepEqual(ids, ['free', 'pro', 'unlimited']);
});

test('plans: free plan has a finite monthly cap', () => {
  const free = getPlanDefinition('free');
  assert.equal(typeof free.generationsPerMonth, 'number');
  assert.ok(free.generationsPerMonth > 0);
  assert.equal(free.priceMonthlyCents, 0);
});

test('plans: unlimited plan has no monthly cap (null, not a number)', () => {
  const unlimited = getPlanDefinition('unlimited');
  assert.equal(unlimited.generationsPerMonth, null);
});

test('plans: unknown plan id falls back to free rather than throwing or returning undefined', () => {
  const result = getPlanDefinition('this-plan-does-not-exist');
  assert.equal(result.id, 'free');
});

test('plans: every plan has the fields fair-use enforcement depends on', () => {
  for (const plan of Object.values(PLAN_DEFINITIONS)) {
    assert.equal(typeof plan.maxDurationSeconds, 'number');
    assert.equal(typeof plan.maxResolution, 'string');
    assert.ok(plan.maxDurationSeconds > 0);
  }
});

test('plans: yearly price is never more than 12x the monthly price (should be a discount, not a markup)', () => {
  for (const plan of Object.values(PLAN_DEFINITIONS)) {
    assert.ok(plan.priceYearlyCents <= plan.priceMonthlyCents * 12);
  }
});
