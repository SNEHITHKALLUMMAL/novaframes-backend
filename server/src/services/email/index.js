import { env } from '../../config/env.js';
import { DevStubEmailProvider } from './DevStubEmailProvider.js';
import { SmtpEmailProvider } from './SmtpEmailProvider.js';

let instance = null;

export function getEmailProvider() {
  if (instance) return instance;

  switch (env.email.provider) {
    case 'dev-stub':
      instance = new DevStubEmailProvider();
      break;
    case 'smtp':
      instance = new SmtpEmailProvider({
        host: env.email.smtpHost,
        port: env.email.smtpPort,
        user: env.email.smtpUser,
        pass: env.email.smtpPass,
        from: env.email.from,
        secure: env.email.smtpPort === 465,
      });
      break;
    default:
      throw new Error(`Unknown EMAIL_PROVIDER "${env.email.provider}". Valid values: "dev-stub", "smtp".`);
  }

  return instance;
}
