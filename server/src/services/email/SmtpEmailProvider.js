import nodemailer from 'nodemailer';

/**
 * Production EmailProvider over SMTP — deliberately provider-agnostic
 * (same reasoning as ObjectStorageProvider using the S3 API rather than a
 * vendor SDK): SES, SendGrid, Postmark, Resend, and Mailgun all offer SMTP
 * credentials, so this one implementation covers all of them via
 * SMTP_HOST/PORT/USER/PASS rather than locking into one vendor's REST API.
 */
export class SmtpEmailProvider {
  constructor({ host, port, user, pass, from, secure, client } = {}) {
    if (!host || !user || !pass || !from) {
      throw new Error('SmtpEmailProvider requires SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM');
    }
    this.from = from;
    // `client` is injectable for tests — avoids a real SMTP connection.
    this.transporter =
      client ?? nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  }

  async send({ to, subject, html, text }) {
    await this.transporter.sendMail({ from: this.from, to, subject, html, text });
  }
}
