import { logger } from '../../utils/logger.js';

/**
 * Local development stand-in — logs the email instead of sending it, so
 * password-reset/verification flows are testable without real SMTP
 * credentials. NEVER use in production — env.js refuses to start with
 * EMAIL_PROVIDER=dev-stub when NODE_ENV=production, same guard pattern as
 * storage/payments.
 */
export class DevStubEmailProvider {
  async send({ to, subject, text }) {
    logger.info(`[dev-stub email] To: ${to} | Subject: ${subject}\n${text}`);
  }
}
