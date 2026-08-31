import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DevStubPaymentProvider } from './DevStubPaymentProvider.js';

test('DevStubPaymentProvider: createCheckoutSession returns a dev checkout URL and tracks the pending session', async () => {
  const provider = new DevStubPaymentProvider();
  const result = await provider.createCheckoutSession({
    userId: 'u1',
    planId: 'pro',
    billingCycle: 'monthly',
    amountCents: 1900,
    successUrl: 'http://localhost:5173/settings?tab=billing',
  });
  assert.ok(result.providerSessionId.startsWith('dev_sess_'));
  assert.ok(result.checkoutUrl.includes(result.providerSessionId));
});

test('DevStubPaymentProvider: simulateCheckoutCompleted returns a normalized event and clears the pending session', async () => {
  const provider = new DevStubPaymentProvider();
  const { providerSessionId } = await provider.createCheckoutSession({
    userId: 'u1',
    planId: 'pro',
    billingCycle: 'yearly',
    amountCents: 19000,
    successUrl: 'http://localhost:5173/settings',
  });

  const event = provider.simulateCheckoutCompleted(providerSessionId);
  assert.equal(event.type, 'checkout.session.completed');
  assert.equal(event.data.userId, 'u1');
  assert.equal(event.data.planId, 'pro');
  assert.equal(event.data.billingCycle, 'yearly');
  assert.equal(event.data.status, 'succeeded');

  assert.throws(() => provider.simulateCheckoutCompleted(providerSessionId), /No pending dev checkout session/);
});

test('DevStubPaymentProvider: cancelSubscription and reactivateSubscription always succeed', async () => {
  const provider = new DevStubPaymentProvider();
  assert.deepEqual(await provider.cancelSubscription('anything'), { cancelled: true });
  assert.deepEqual(await provider.reactivateSubscription('anything'), { reactivated: true });
});
