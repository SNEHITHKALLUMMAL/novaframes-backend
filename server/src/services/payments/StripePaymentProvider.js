import Stripe from 'stripe';
import { InvalidWebhookSignatureError } from './PaymentProvider.js';

/**
 * Production PaymentProvider backed by Stripe Checkout + webhooks.
 * Selected when PAYMENT_PROVIDER=stripe (see ./index.js; env.js refuses
 * to start in production on PAYMENT_PROVIDER=dev-stub).
 *
 * Card data never reaches this codebase: createCheckoutSession returns a
 * URL to Stripe's own hosted Checkout page, and the only thing this class
 * receives back is Stripe's own event payload, verified by signature.
 */
export class StripePaymentProvider {
  constructor({ secretKey, webhookSecret, client } = {}) {
    if (!secretKey) throw new Error('StripePaymentProvider requires STRIPE_SECRET_KEY');
    if (!webhookSecret) throw new Error('StripePaymentProvider requires STRIPE_WEBHOOK_SECRET');
    this.webhookSecret = webhookSecret;
    // `client` is injectable for tests — avoids making a real network call
    // or requiring a real Stripe account to unit-test this class.
    this.stripe = client ?? new Stripe(secretKey, { apiVersion: '2024-06-20' });
  }

  async createCheckoutSession({
    userId,
    userEmail,
    planId,
    billingCycle,
    amountCents,
    successUrl,
    cancelUrl,
  }) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: userEmail,
      client_reference_id: userId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Ad-hoc recurring price rather than a pre-created Stripe Price ID —
      // plan pricing is defined once in constants/plans.js and this keeps
      // it the single source of truth rather than duplicating amounts in
      // the Stripe dashboard and having them drift out of sync.
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `NovaFrame — ${planId} plan` },
            recurring: { interval: billingCycle === 'yearly' ? 'year' : 'month' },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: { userId, planId, billingCycle },
      subscription_data: { metadata: { userId, planId, billingCycle } },
    });

    return { checkoutUrl: session.url, providerSessionId: session.id };
  }

  verifyAndParseWebhook(rawBody, signatureHeader) {
    let event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signatureHeader, this.webhookSecret);
    } catch (err) {
      throw new InvalidWebhookSignatureError(err.message);
    }

    return {
      type: event.type,
      providerEventId: event.id,
      data: this.#normalizeEventData(event),
    };
  }

  /**
   * Maps the handful of Stripe event types subscription.service.js cares
   * about into one normalized shape, so the service layer never branches
   * on Stripe's own object structure — matches the same abstraction goal
   * as the rest of the PaymentProvider interface.
   */
  #normalizeEventData(event) {
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
        return {
          providerSessionId: obj.id,
          providerSubscriptionId: obj.subscription,
          userId: obj.metadata?.userId ?? obj.client_reference_id,
          planId: obj.metadata?.planId,
          billingCycle: obj.metadata?.billingCycle,
          status: 'succeeded',
        };
      case 'invoice.payment_failed':
        return {
          providerSubscriptionId: obj.subscription,
          userId: obj.subscription_details?.metadata?.userId,
          status: 'failed',
        };
      case 'customer.subscription.deleted':
        return {
          providerSubscriptionId: obj.id,
          userId: obj.metadata?.userId,
          status: 'cancelled',
        };
      case 'customer.subscription.updated':
        return {
          providerSubscriptionId: obj.id,
          userId: obj.metadata?.userId,
          cancelAtPeriodEnd: obj.cancel_at_period_end,
          status: obj.status, // 'active' | 'past_due' | 'canceled' | ...
        };
      default:
        return { raw: obj };
    }
  }

  async cancelSubscription(providerSubscriptionId) {
    await this.stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: true });
    return { cancelled: true };
  }

  async reactivateSubscription(providerSubscriptionId) {
    await this.stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: false });
    return { reactivated: true };
  }
}
