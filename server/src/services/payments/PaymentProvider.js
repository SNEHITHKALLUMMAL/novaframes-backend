/**
 * PaymentProvider contract. Every backend (DevStubPaymentProvider,
 * StripePaymentProvider) implements this shape so the rest of the app
 * never touches a provider SDK directly — selected once in
 * getPaymentProvider() (./index.js), based on PAYMENT_PROVIDER.
 *
 * Deliberately checkout-session + webhook shaped, not a synchronous
 * charge() call: real card processing (3D Secure/SCA, hosted checkout
 * pages) is asynchronous by nature, and the SRS's core payment security
 * rule — this codebase must never see a card number, CVV, or expiry date —
 * requires redirecting to (or embedding) the provider's own hosted
 * checkout/payment element rather than collecting card details ourselves.
 * The subsequent confirmation always arrives out-of-band, via a signed
 * webhook, not as the return value of the checkout-creation call.
 *
 * @typedef {Object} PaymentProvider
 *
 * @property {(params: {
 *   userId: string, userEmail: string, planId: string, billingCycle: string,
 *   amountCents: number, successUrl: string, cancelUrl: string
 * }) => Promise<{ checkoutUrl: string, providerSessionId: string }>} createCheckoutSession
 *
 * @property {(rawBody: Buffer, signatureHeader: string) => {
 *   type: string, providerEventId: string, data: object
 * }} verifyAndParseWebhook
 *   Verifies the webhook's signature (throwing on failure — an invalid
 *   signature must never be treated as a valid event) and returns a
 *   normalized event. Synchronous by contract even though a real SDK call
 *   might not need to be async — signature verification is CPU-bound
 *   HMAC comparison, not I/O.
 *
 * @property {(providerSubscriptionId: string) => Promise<{ cancelled: boolean }>} cancelSubscription
 * @property {(providerSubscriptionId: string) => Promise<{ reactivated: boolean }>} reactivateSubscription
 */

export class NotImplementedPaymentError extends Error {
  constructor(method) {
    super(`PaymentProvider.${method}() is not implemented by this backend`);
    this.name = 'NotImplementedPaymentError';
  }
}

export class InvalidWebhookSignatureError extends Error {
  constructor(detail) {
    super(`Webhook signature verification failed${detail ? `: ${detail}` : ''}`);
    this.name = 'InvalidWebhookSignatureError';
  }
}
