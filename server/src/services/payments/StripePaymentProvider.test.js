import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StripePaymentProvider } from './StripePaymentProvider.js';
import { InvalidWebhookSignatureError } from './PaymentProvider.js';

function makeFakeStripe({ constructEventImpl } = {}) {
  const calls = { checkoutSessionsCreate: [], subscriptionsUpdate: [] };
  return {
    calls,
    checkout: {
      sessions: {
        create: async (params) => {
          calls.checkoutSessionsCreate.push(params);
          return { id: 'cs_test_123', url: 'https://checkout.stripe.com/pay/cs_test_123' };
        },
      },
    },
    webhooks: {
      constructEvent: (rawBody, signature, secret) => {
        if (constructEventImpl) return constructEventImpl(rawBody, signature, secret);
        throw new Error('unexpected signature');
      },
    },
    subscriptions: {
      update: async (id, params) => {
        calls.subscriptionsUpdate.push({ id, params });
        return {};
      },
    },
  };
}

function makeProvider(overrides = {}) {
  return new StripePaymentProvider({
    secretKey: 'sk_test_xxx',
    webhookSecret: 'whsec_xxx',
    client: makeFakeStripe(overrides),
  });
}

test('StripePaymentProvider: createCheckoutSession builds a subscription-mode session with plan metadata', async () => {
  const provider = makeProvider();
  const result = await provider.createCheckoutSession({
    userId: 'u1',
    userEmail: 'a@example.com',
    planId: 'pro',
    billingCycle: 'monthly',
    amountCents: 1900,
    successUrl: 'https://app.example.com/success',
    cancelUrl: 'https://app.example.com/cancel',
  });
  assert.equal(result.checkoutUrl, 'https://checkout.stripe.com/pay/cs_test_123');
  assert.equal(result.providerSessionId, 'cs_test_123');

  const created = provider.stripe.calls.checkoutSessionsCreate[0];
  assert.equal(created.mode, 'subscription');
  assert.equal(created.customer_email, 'a@example.com');
  assert.equal(created.metadata.planId, 'pro');
  assert.equal(created.line_items[0].price_data.unit_amount, 1900);
  assert.equal(created.line_items[0].price_data.recurring.interval, 'month');
});

test('StripePaymentProvider: createCheckoutSession uses yearly interval for yearly billing', async () => {
  const provider = makeProvider();
  await provider.createCheckoutSession({
    userId: 'u1',
    userEmail: 'a@example.com',
    planId: 'pro',
    billingCycle: 'yearly',
    amountCents: 19000,
    successUrl: 'https://x/success',
    cancelUrl: 'https://x/cancel',
  });
  assert.equal(provider.stripe.calls.checkoutSessionsCreate[0].line_items[0].price_data.recurring.interval, 'year');
});

test('StripePaymentProvider: verifyAndParseWebhook normalizes checkout.session.completed', () => {
  const provider = makeProvider({
    constructEventImpl: () => ({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          subscription: 'sub_abc',
          client_reference_id: 'u1',
          metadata: { userId: 'u1', planId: 'pro', billingCycle: 'monthly' },
        },
      },
    }),
  });
  const event = provider.verifyAndParseWebhook(Buffer.from('{}'), 'sig');
  assert.equal(event.type, 'checkout.session.completed');
  assert.equal(event.providerEventId, 'evt_1');
  assert.equal(event.data.providerSessionId, 'cs_test_123');
  assert.equal(event.data.providerSubscriptionId, 'sub_abc');
  assert.equal(event.data.userId, 'u1');
  assert.equal(event.data.status, 'succeeded');
});

test('StripePaymentProvider: verifyAndParseWebhook throws InvalidWebhookSignatureError on a bad signature', () => {
  const provider = makeProvider({
    constructEventImpl: () => {
      throw new Error('No signatures found matching the expected signature');
    },
  });
  assert.throws(
    () => provider.verifyAndParseWebhook(Buffer.from('{}'), 'bad-sig'),
    InvalidWebhookSignatureError
  );
});

test('StripePaymentProvider: cancelSubscription sets cancel_at_period_end true', async () => {
  const provider = makeProvider();
  const result = await provider.cancelSubscription('sub_abc');
  assert.equal(result.cancelled, true);
  assert.deepEqual(provider.stripe.calls.subscriptionsUpdate[0], {
    id: 'sub_abc',
    params: { cancel_at_period_end: true },
  });
});

test('StripePaymentProvider: reactivateSubscription sets cancel_at_period_end false', async () => {
  const provider = makeProvider();
  const result = await provider.reactivateSubscription('sub_abc');
  assert.equal(result.reactivated, true);
  assert.deepEqual(provider.stripe.calls.subscriptionsUpdate[0], {
    id: 'sub_abc',
    params: { cancel_at_period_end: false },
  });
});

test('StripePaymentProvider: constructor requires both secretKey and webhookSecret', () => {
  assert.throws(() => new StripePaymentProvider({ secretKey: '', webhookSecret: 'whsec_x' }));
  assert.throws(() => new StripePaymentProvider({ secretKey: 'sk_x', webhookSecret: '' }));
});
