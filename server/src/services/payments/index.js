import { env } from '../../config/env.js';
import { DevStubPaymentProvider } from './DevStubPaymentProvider.js';

let instance = null;

export function getPaymentProvider() {
  if (instance) return instance;

  switch (env.payment.provider) {
    case 'dev-stub':
      instance = new DevStubPaymentProvider();
      break;
    // case 'stripe': instance = new StripePaymentProvider(); break;   // not implemented — see docs/SUBSCRIPTIONS.md
    // case 'razorpay': instance = new RazorpayPaymentProvider(); break; // not implemented — see docs/SUBSCRIPTIONS.md
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${env.payment.provider}". Only "dev-stub" is implemented in ` +
          `this build — a real Stripe/Razorpay provider needs live credentials this environment doesn't have.`
      );
  }

  return instance;
}
