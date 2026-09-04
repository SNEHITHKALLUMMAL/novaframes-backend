import crypto from 'node:crypto';
import { InvalidWebhookSignatureError } from './PaymentProvider.js';

/**
 * Production PaymentProvider backed by Razorpay.
 * Selected when PAYMENT_PROVIDER=razorpay (see ./index.js; env.js refuses
 * to start in production on PAYMENT_PROVIDER=dev-stub).
 *
 * Unlike Stripe's hosted Checkout redirect, Razorpay uses a client-side
 * popup (Razorpay Checkout). The flow is:
 *   1. Frontend calls POST /payments/create-order with { plan, billingCycle }
 *   2. Backend creates a Razorpay Order via the SDK and returns { orderId, keyId, amount, currency }
 *   3. Frontend opens Razorpay Checkout popup with the order
 *   4. On success, frontend calls POST /payments/verify with { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *   5. Backend verifies the signature and activates the subscription
 *
 * Card data never reaches this codebase — the Razorpay Checkout popup handles
 * all sensitive input, and only opaque IDs are returned.
 */
let _RazorpayCtor = null;

async function getRazorpayCtor() {
  if (!_RazorpayCtor) {
    const mod = await import('razorpay');
    _RazorpayCtor = mod.default;
  }
  return _RazorpayCtor;
}

export class RazorpayPaymentProvider {
  constructor({ keyId, keySecret, webhookSecret, client } = {}) {
    if (!keyId) throw new Error('RazorpayPaymentProvider requires RAZORPAY_KEY_ID');
    if (!keySecret) throw new Error('RazorpayPaymentProvider requires RAZORPAY_KEY_SECRET');
    if (!webhookSecret) throw new Error('RazorpayPaymentProvider requires RAZORPAY_WEBHOOK_SECRET');
    this.webhookSecret = webhookSecret; // for webhook signature verification
    this._keyId = keyId;
    this._keySecret = keySecret; // for payment signature verification
    this._keySecretForPayments = keySecret;
    // `client` is injectable for tests — avoids making a real network call
    // or requiring a real Razorpay account to unit-test this class.
    this.razorpay = client ?? null;
  }

  /** Lazily initialize the real Razorpay SDK client on first use. */
  async #ensureClient() {
    if (this.razorpay) return;
    const Razorpay = await getRazorpayCtor();
    this.razorpay = new Razorpay({ key_id: this._keyId, key_secret: this._keySecret });
  }

  /**
   * Create a Razorpay Order for the frontend popup checkout.
   * Returns { orderId, keyId, amount, currency } — enough for the frontend
   * to open Razorpay Checkout, never the secret key.
   */
  async createOrder({ userId, planId, billingCycle, amountCents }) {
    await this.#ensureClient();
    // Razorpay amount is in the smallest currency unit (paise for INR)
    const order = await this.razorpay.orders.create({
      amount: amountCents,
      currency: 'INR',
      receipt: `novaframe_${userId}_${planId}_${billingCycle}_${Date.now()}`,
      notes: { userId: userId.toString(), planId, billingCycle },
    });

    return {
      orderId: order.id,
      amount: Number(order.amount),
      currency: order.currency,
    };
  }

  /**
   * Verify Razorpay payment signature after the frontend popup completes.
   * Throws InvalidWebhookSignatureError on bad signature.
   */
  verifyPaymentSignature({ orderId, paymentId, signature }) {
    // Razorpay payment signature uses the API Key Secret, NOT the webhook secret.
    const expected = crypto
      .createHmac('sha256', this._keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (expected !== signature) {
      throw new InvalidWebhookSignatureError('Razorpay payment signature mismatch');
    }
    return true;
  }

  /**
   * Verify Razorpay webhook signature using the raw body buffer.
   * Razorpay signs the exact raw JSON payload — same pattern as Stripe.
   */
  verifyAndParseWebhook(rawBody, signatureHeader) {
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expected !== signatureHeader) {
      throw new InvalidWebhookSignatureError('Razorpay webhook signature mismatch');
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      throw new InvalidWebhookSignatureError('Could not parse webhook payload');
    }

    return {
      type: event.event,
      providerEventId: event.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      data: this.#normalizeEventData(event),
    };
  }

  /**
   * Maps Razorpay webhook event types into the same normalized shape
   * subscription.service.js expects — matching the PaymentProvider interface.
   */
  #normalizeEventData(event) {
    const payload = event.payload || {};
    const payment = payload.payment?.entity || {};
    const subscription = payload.subscription?.entity || {};
    const invoice = payload.invoice?.entity || {};

    switch (event.event) {
      case 'payment.captured':
      case 'payment.authorized': {
        // Extract plan/billing info from order notes or metadata
        const notes = payment.notes || {};
        return {
          providerPaymentId: payment.id,
          providerOrderId: payment.order_id,
          providerSubscriptionId: subscription.id || null,
          userId: notes.userId,
          planId: notes.planId,
          billingCycle: notes.billingCycle,
          status: 'succeeded',
          amount: payment.amount,
        };
      }

      case 'payment.failed': {
        const notes = payment.notes || {};
        return {
          providerPaymentId: payment.id,
          providerOrderId: payment.order_id,
          providerSubscriptionId: subscription.id || null,
          userId: notes.userId,
          status: 'failed',
          errorCode: payment.error_code,
          errorDescription: payment.error_description,
        };
      }

      case 'subscription.activated':
      case 'subscription.charged': {
        return {
          providerSubscriptionId: subscription.id,
          userId: subscription.notes?.userId || subscription.receipt,
          planId: subscription.notes?.planId,
          billingCycle: subscription.notes?.billingCycle,
          status: 'succeeded',
          amount: invoice.amount || subscription.amount,
        };
      }

      case 'subscription.cancelled':
      case 'subscription.halted': {
        return {
          providerSubscriptionId: subscription.id,
          userId: subscription.notes?.userId || subscription.receipt,
          status: 'cancelled',
        };
      }

      case 'subscription.completed': {
        return {
          providerSubscriptionId: subscription.id,
          userId: subscription.notes?.userId || subscription.receipt,
          status: 'completed',
        };
      }

      case 'refund.created':
      case 'refund.processed': {
        return {
          providerPaymentId: payment.id,
          providerOrderId: payment.order_id,
          userId: payment.notes?.userId,
          status: 'refunded',
          amount: payload.refund?.entity?.amount,
        };
      }

      default:
        return { raw: event };
    }
  }

  /**
   * Cancel a Razorpay subscription at period end.
   * For one-time orders, this is a no-op (no recurring subscription to cancel).
   */
  async cancelSubscription(providerSubscriptionId) {
    if (!providerSubscriptionId) return { cancelled: true };
    await this.#ensureClient();
    try {
      await this.razorpay.subscriptions.cancel(providerSubscriptionId);
    } catch (err) {
      // If subscription doesn't exist or is already cancelled, treat as success
      if (err.statusCode === 400 || err.statusCode === 404) {
        return { cancelled: true };
      }
      throw err;
    }
    return { cancelled: true };
  }

  /**
   * Reactivate a cancelled Razorpay subscription.
   */
  async reactivateSubscription(providerSubscriptionId) {
    if (!providerSubscriptionId) return { reactivated: true };
    await this.#ensureClient();
    try {
      await this.razorpay.subscriptions.resume(providerSubscriptionId, {
        resume_at: 'now',
      });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 404) {
        return { reactivated: true };
      }
      throw err;
    }
    return { reactivated: true };
  }
}
