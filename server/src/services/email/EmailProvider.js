/**
 * EmailProvider contract — same pattern as StorageProvider/PaymentProvider:
 * selected once in ./index.js via EMAIL_PROVIDER, so nothing else in the
 * app imports a concrete provider or an SMTP/API client directly.
 *
 * @typedef {Object} EmailProvider
 * @property {(params: { to: string, subject: string, html: string, text: string }) => Promise<void>} send
 */

export class NotImplementedEmailError extends Error {
  constructor(method) {
    super(`EmailProvider.${method}() is not implemented by this backend`);
    this.name = 'NotImplementedEmailError';
  }
}
