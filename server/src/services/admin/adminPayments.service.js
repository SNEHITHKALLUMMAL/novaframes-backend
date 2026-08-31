import { Payment } from '../../models/Payment.model.js';
import { WebhookEvent } from '../../models/WebhookEvent.model.js';

/**
 * SRS PHASE_16 "Payment monitoring" — didn't exist before this phase.
 * The overview dashboard (adminOverview.service.js) already surfaces
 * aggregate revenue, but there was no way to browse or filter individual
 * payment records, and no visibility at all into failed webhook
 * processing (WebhookEvent.status: 'failed') — the exact case where an
 * admin most needs to look something up (a user says they paid but their
 * plan didn't update; the answer is almost always "the webhook errored,
 * check here").
 */
export async function listAllPayments({ status, userId, page, limit }) {
  const filter = {};
  if (status) filter.status = status;
  if (userId) filter.user = userId;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email')
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return { payments, total, page, limit };
}

export async function listWebhookEvents({ status, page, limit }) {
  const filter = {};
  if (status) filter.status = status;

  const [events, total] = await Promise.all([
    WebhookEvent.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    WebhookEvent.countDocuments(filter),
  ]);

  return { events, total, page, limit };
}
