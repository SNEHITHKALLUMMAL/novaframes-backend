import { randomUUID } from 'node:crypto';

/**
 * Simulates a payment provider for local development (no real Stripe
 * account/credentials available). Matches the same checkout-session +
 * webhook shape as the real StripePaymentProvider — rather than
 * short-circuiting straight to "success", createCheckoutSession returns a
 * URL to a dev-only route that a developer (or a test) hits to simulate
 * the user completing checkout on Stripe's hosted page. This means the
 * exact same subscription.service.js code path (idempotent webhook
 * handling) is exercised in local dev as in production — the stub differs
 * only in *how* the "webhook" is triggered, not in what happens after.
 *
 * NEVER use this in production — env.js refuses to start with
 * PAYMENT_PROVIDER=dev-stub when NODE_ENV=production. See docs/BILLING.md
 * for what a real provider needs and how local dev testing works.
 */
export class DevStubPaymentProvider {
  constructor() {
    // In-memory only — acceptable for a dev-only stub; a restart just
    // means any pending (not-yet-simulated) checkout session is lost.
    this.pendingSessions = new Map();
  }

  async createCheckoutSession({ userId, planId, billingCycle, amountCents, successUrl }) {
    const providerSessionId = `dev_sess_${randomUUID()}`;
    this.pendingSessions.set(providerSessionId, { userId, planId, billingCycle, amountCents });
    return {
      // Not a real payment page — see routes/payments.routes.js's
      // POST /dev/simulate-checkout/:sessionId (dev-stub only, non-production).
      checkoutUrl: `${successUrl.split('?')[0]}?dev_checkout_session=${providerSessionId}`,
      providerSessionId,
    };
  }

  /**
   * Not part of the shared PaymentProvider interface — dev-stub-only, used
   * by the dev/simulate-checkout route to synthesize a normalized webhook
   * event without a real signature (there's nothing to sign; this never
   * runs in production).
   */
  simulateCheckoutCompleted(providerSessionId) {
    const pending = this.pendingSessions.get(providerSessionId);
    if (!pending) {
      throw new Error(`No pending dev checkout session: ${providerSessionId}`);
    }
    this.pendingSessions.delete(providerSessionId);
    return {
      type: 'checkout.session.completed',
      providerEventId: `dev_evt_${randomUUID()}`,
      data: {
        providerSessionId,
        providerSubscriptionId: `dev_sub_${randomUUID()}`,
        userId: pending.userId,
        planId: pending.planId,
        billingCycle: pending.billingCycle,
        status: 'succeeded',
      },
    };
  }

  verifyAndParseWebhook(rawBody) {
    // No real signature in dev — this method exists only so a test can
    // exercise the same shared interface shape; nothing calls this for the
    // dev-stub provider in practice (the dev/simulate-checkout route calls
    // simulateCheckoutCompleted() directly instead).
    return JSON.parse(rawBody.toString());
  }

  async cancelSubscription() {
    return { cancelled: true };
  }

  async reactivateSubscription() {
    return { reactivated: true };
  }
}
