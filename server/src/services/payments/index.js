import { env } from '../../config/env.js';
import { DevStubPaymentProvider } from './DevStubPaymentProvider.js';
import { RazorpayPaymentProvider } from './RazorpayPaymentProvider.js';

let instance = null;

export function getPaymentProvider() {
  if (instance) return instance;

  switch (env.payment.provider) {
    case 'dev-stub':
      instance = new DevStubPaymentProvider();
      break;
    case 'razorpay':
      instance = new RazorpayPaymentProvider({
        keyId: env.payment.razorpay.keyId,
        keySecret: env.payment.razorpay.keySecret,
        webhookSecret: env.payment.razorpay.webhookSecret,
      });
      break;
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER "${env.payment.provider}". Valid values: "dev-stub", "razorpay".`);
  }

  return instance;
}
