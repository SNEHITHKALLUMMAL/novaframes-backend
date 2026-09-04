import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { RazorpayPaymentProvider } from './RazorpayPaymentProvider.js';
import { InvalidWebhookSignatureError } from './PaymentProvider.js';

function makeFakeRazorpay({ ordersCreateImpl, subscriptionsCancelImpl, subscriptionsResumeImpl } = {}) {
  const calls = { ordersCreate: [], subscriptionsCancel: [], subscriptionsResume: [] };
  return {
    calls,
    orders: {
      create: async (params) => {
        calls.ordersCreate.push(params);
        return { id: 'order_test_123', amount: params.amount, currency: params.currency || 'INR' };
      },
    },
    subscriptions: {
      cancel: async (id) => {
        calls.subscriptionsCancel.push(id);
        if (subscriptionsCancelImpl) return subscriptionsCancelImpl(id);
        return {};
      },
      resume: async (id, params) => {
        calls.subscriptionsResume.push({ id, params });
        if (subscriptionsResumeImpl) return subscriptionsResumeImpl(id, params);
        return {};
      },
    },
  };
}

function makeProvider(overrides = {}) {
  return new RazorpayPaymentProvider({
    keyId: 'rzp_test_xxx',
    keySecret: 'test_secret_xxx',
    webhookSecret: 'webhook_secret_xxx',
    client: makeFakeRazorpay(overrides),
  });
}

test('RazorpayPaymentProvider: createOrder creates a Razorpay order with correct params', async () => {
  const provider = makeProvider();
  const result = await provider.createOrder({
    userId: 'u1',
    planId: 'pro',
    billingCycle: 'monthly',
    amountCents: 1900,
  });
  assert.equal(result.orderId, 'order_test_123');
  assert.equal(result.amount, 1900);
  assert.equal(result.currency, 'INR');

  const created = provider.razorpay.calls.ordersCreate[0];
  assert.equal(created.amount, 1900);
  assert.equal(created.currency, 'INR');
  assert.ok(created.receipt.includes('u1'));
  assert.ok(created.receipt.includes('pro'));
  assert.equal(created.notes.planId, 'pro');
  assert.equal(created.notes.billingCycle, 'monthly');
});

test('RazorpayPaymentProvider: verifyPaymentSignature verifies a valid signature using keySecret', () => {
  const provider = makeProvider();
  const orderId = 'order_test_123';
  const paymentId = 'pay_test_456';
  // Payment signature verification uses keySecret (RAZORPAY_KEY_SECRET), NOT webhookSecret
  const expectedSig = crypto
    .createHmac('sha256', 'test_secret_xxx')
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const result = provider.verifyPaymentSignature({ orderId, paymentId, signature: expectedSig });
  assert.equal(result, true);
});

test('RazorpayPaymentProvider: verifyPaymentSignature throws on invalid signature', () => {
  const provider = makeProvider();
  assert.throws(
    () =>
      provider.verifyPaymentSignature({
        orderId: 'order_test_123',
        paymentId: 'pay_test_456',
        signature: 'bad_signature',
      }),
    InvalidWebhookSignatureError
  );
});

test('RazorpayPaymentProvider: verifyPaymentSignature rejects webhookSecret for payment verification', () => {
  const provider = makeProvider();
  const orderId = 'order_test_123';
  const paymentId = 'pay_test_456';
  // Using webhookSecret instead of keySecret should fail
  const wrongSig = crypto
    .createHmac('sha256', 'webhook_secret_xxx')
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  assert.throws(
    () => provider.verifyPaymentSignature({ orderId, paymentId, signature: wrongSig }),
    InvalidWebhookSignatureError
  );
});

test('RazorpayPaymentProvider: verifyAndParseWebhook verifies and normalizes payment.captured', () => {
  const provider = makeProvider();
  const payload = JSON.stringify({
    event: 'payment.captured',
    id: 'evt_1',
    payload: {
      payment: {
        entity: {
          id: 'pay_abc',
          order_id: 'order_xyz',
          amount: 1900,
          notes: { userId: 'u1', planId: 'pro', billingCycle: 'monthly' },
        },
      },
    },
  });

  const signature = crypto
    .createHmac('sha256', 'webhook_secret_xxx')
    .update(payload)
    .digest('hex');

  const event = provider.verifyAndParseWebhook(Buffer.from(payload), signature);
  assert.equal(event.type, 'payment.captured');
  assert.equal(event.providerEventId, 'evt_1');
  assert.equal(event.data.providerPaymentId, 'pay_abc');
  assert.equal(event.data.providerOrderId, 'order_xyz');
  assert.equal(event.data.userId, 'u1');
  assert.equal(event.data.planId, 'pro');
  assert.equal(event.data.status, 'succeeded');
});

test('RazorpayPaymentProvider: verifyAndParseWebhook throws InvalidWebhookSignatureError on bad signature', () => {
  const provider = makeProvider();
  assert.throws(
    () => provider.verifyAndParseWebhook(Buffer.from('{}'), 'bad_signature'),
    InvalidWebhookSignatureError
  );
});

test('RazorpayPaymentProvider: cancelSubscription calls subscriptions.cancel', async () => {
  const provider = makeProvider();
  const result = await provider.cancelSubscription('sub_abc');
  assert.equal(result.cancelled, true);
  assert.equal(provider.razorpay.calls.subscriptionsCancel[0], 'sub_abc');
});

test('RazorpayPaymentProvider: cancelSubscription returns success when subscription not found', async () => {
  const provider = makeProvider({
    subscriptionsCancelImpl: () => {
      const err = new Error('Not found');
      err.statusCode = 404;
      throw err;
    },
  });
  const result = await provider.cancelSubscription('sub_missing');
  assert.equal(result.cancelled, true);
});

test('RazorpayPaymentProvider: reactivateSubscription calls subscriptions.resume', async () => {
  const provider = makeProvider();
  const result = await provider.reactivateSubscription('sub_abc');
  assert.equal(result.reactivated, true);
  assert.deepEqual(provider.razorpay.calls.subscriptionsResume[0], {
    id: 'sub_abc',
    params: { resume_at: 'now' },
  });
});

test('RazorpayPaymentProvider: constructor requires all three credentials', () => {
  assert.throws(() => new RazorpayPaymentProvider({ keyId: '', keySecret: 'x', webhookSecret: 'x' }));
  assert.throws(() => new RazorpayPaymentProvider({ keyId: 'x', keySecret: '', webhookSecret: 'x' }));
  assert.throws(() => new RazorpayPaymentProvider({ keyId: 'x', keySecret: 'x', webhookSecret: '' }));
});
