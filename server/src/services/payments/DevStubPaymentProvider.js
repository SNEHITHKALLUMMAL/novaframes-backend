import { randomUUID } from 'node:crypto';

/**
 * Simulates a payment provider for local development and this build's
 * sandbox (no real Stripe/Razorpay account or credentials available).
 * Every "charge" instantly succeeds and returns a fake opaque ID —
 * genuinely no card data is ever accepted or requested, since this
 * provider (like the real ones it stands in for) never has a code path
 * that takes card details as input at all.
 *
 * NEVER use this in production — see docs/SUBSCRIPTIONS.md for what a real
 * Stripe/Razorpay provider implementation needs.
 */
export class DevStubPaymentProvider {
  async charge({ userId, planId, billingCycle, amountCents }) {
    void userId; // unused in the stub — a real provider would attach the charge to a customer record
    return {
      providerPaymentId: `dev_pay_${randomUUID()}`,
      providerSubscriptionId: `dev_sub_${randomUUID()}`,
      status: 'succeeded',
      // Echoed back only for logging/debugging — not part of the interface contract.
      _debug: { planId, billingCycle, amountCents },
    };
  }

  async cancelSubscription(providerSubscriptionId) {
    void providerSubscriptionId;
    return { cancelled: true };
  }
}
