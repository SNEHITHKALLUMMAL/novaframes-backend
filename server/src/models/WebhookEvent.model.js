import mongoose from 'mongoose';
import { WEBHOOK_EVENT_STATUS } from '../constants/enums.js';

const { Schema, model } = mongoose;

/**
 * Records every payment-provider webhook event this API has seen, keyed by
 * the provider's own event ID. This is the idempotency mechanism required
 * by the SRS ("Implement webhook idempotency") — Stripe (and most
 * providers) explicitly guarantee at-least-once delivery, meaning the same
 * event can arrive twice (retries, duplicate sends). Before processing an
 * event, subscription.service.js checks for an existing document with the
 * same providerEventId and short-circuits if found, rather than risking a
 * double-applied subscription change or a double-created Payment record.
 *
 * Kept as its own collection (not folded into Payment) because a webhook
 * event doesn't always correspond 1:1 with a Payment document — some event
 * types (e.g. a subscription cancellation) don't create one at all.
 */
const webhookEventSchema = new Schema(
  {
    provider: {
      type: String,
      required: true, // 'stripe' | 'dev-stub'
    },
    providerEventId: {
      type: String,
      required: true,
      unique: true, // the actual idempotency key
    },
    type: {
      type: String,
      required: true, // e.g. 'checkout.session.completed'
    },
    status: {
      type: String,
      enum: Object.values(WEBHOOK_EVENT_STATUS),
      default: WEBHOOK_EVENT_STATUS.RECEIVED,
      index: true,
    },
    // Small, non-sensitive subset of the event for debugging/audit — never
    // the full raw payload (which could contain more than needed and grows
    // the collection unnecessarily; the provider's own dashboard is the
    // source of truth for full event contents).
    summary: {
      type: Schema.Types.Mixed,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export const WebhookEvent = model('WebhookEvent', webhookEventSchema);
