import { env } from '../../config/env.js';
import { DevStubPaymentProvider } from './DevStubPaymentProvider.js';
import { StripePaymentProvider } from './StripePaymentProvider.js';

let instance = null;

export function getPaymentProvider() {
  if (instance) return instance;

  switch (env.payment.provider) {
    case 'dev-stub':
      instance = new DevStubPaymentProvider();
      break;
    case 'stripe':
      instance = new StripePaymentProvider({
        secretKey: env.payment.stripeSecretKey,
        webhookSecret: env.payment.stripeWebhookSecret,
      });
      break;
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER "${env.payment.provider}". Valid values: "dev-stub", "stripe".`);
  }

  return instance;
}
