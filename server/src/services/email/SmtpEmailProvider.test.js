import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SmtpEmailProvider } from './SmtpEmailProvider.js';

function makeFakeTransporter() {
  const sent = [];
  return {
    sent,
    sendMail: async (options) => {
      sent.push(options);
      return { messageId: 'fake-id' };
    },
  };
}

test('SmtpEmailProvider: send() forwards to the transporter with the configured from address', async () => {
  const transporter = makeFakeTransporter();
  const provider = new SmtpEmailProvider({
    host: 'smtp.example.com',
    port: 587,
    user: 'user',
    pass: 'pass',
    from: 'NovaFrame <no-reply@novaframe.example>',
    client: transporter,
  });

  await provider.send({ to: 'user@example.com', subject: 'Hi', text: 'hello', html: '<p>hello</p>' });

  assert.equal(transporter.sent.length, 1);
  assert.equal(transporter.sent[0].from, 'NovaFrame <no-reply@novaframe.example>');
  assert.equal(transporter.sent[0].to, 'user@example.com');
  assert.equal(transporter.sent[0].subject, 'Hi');
});

test('SmtpEmailProvider: constructor requires host, user, pass, and from', () => {
  assert.throws(() => new SmtpEmailProvider({ host: '', user: 'u', pass: 'p', from: 'f' }));
  assert.throws(() => new SmtpEmailProvider({ host: 'h', user: '', pass: 'p', from: 'f' }));
  assert.throws(() => new SmtpEmailProvider({ host: 'h', user: 'u', pass: '', from: 'f' }));
  assert.throws(() => new SmtpEmailProvider({ host: 'h', user: 'u', pass: 'p', from: '' }));
});
