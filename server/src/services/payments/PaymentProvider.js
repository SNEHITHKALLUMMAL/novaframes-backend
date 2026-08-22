/**
 * PaymentProvider contract. Every backend (DevStubProvider now, a real
 * Stripe/Razorpay provider in production) implements this shape so the
 * rest of the app never touches a provider SDK directly — selected once
 * in getPaymentProvider() (./index.js), based on PAYMENT_PROVIDER.
 *
 * Security rule enforced by this interface's shape: no method here ever
 * accepts raw card details. A real implementation is expected to redirect
 * to (or embed) the provider's own hosted checkout/payment element and
 * only ever receive back an opaque confirmation — this codebase should
 * never see a card number, CVV, or expiry date at any point.
 *
 * @typedef {Object} PaymentProvider
 * @property {(params: { userId: string, planId: string, billingCycle: string, amountCents: number }) => Promise<{ providerPaymentId: string, providerSubscriptionId: string, status: 'succeeded'|'pending'|'failed' }>} charge
 * @property {(providerSubscriptionId: string) => Promise<{ cancelled: boolean }>} cancelSubscription
 */

export class NotImplementedPaymentError extends Error {
  constructor(method) {
    super(`PaymentProvider.${method}() is not implemented by this backend`);
    this.name = 'NotImplementedPaymentError';
  }
}
