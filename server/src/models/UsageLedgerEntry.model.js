import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Immutable, append-only ledger of quota-affecting events — the SRS's
 * explicit requirement: "Never rely only on a mutable balance field for
 * financial or credit accounting." Replaces the previous design, which
 * incremented a single Usage.generationsCount counter per billing period
 * with no per-event record and no refund path at all.
 *
 * Current usage for a period is DERIVED by summing entries (charges minus
 * refunds), never read from — or written to — a separately-maintained
 * counter. See usage.service.js#getMyUsage. This trades a tiny bit of
 * read-time aggregation cost for the actual guarantee the SRS asks for:
 * every unit of usage is individually traceable to the job that caused it,
 * and reversible without losing the history of why.
 *
 * Documents in this collection are NEVER updated or deleted after
 * creation — application code must only ever insert. The compound unique
 * index below is the idempotency/double-charge-prevention mechanism: at
 * most one 'charge' and at most one 'refund' entry can ever exist for a
 * given (generationJob, type) pair, so calling chargeGenerationUsage() or
 * refundGenerationUsage() twice for the same job (a retry, a duplicate
 * webhook-like event, a race) is a no-op the second time, not a double
 * count — mirrors the WebhookEvent idempotency pattern from PHASE_13.
 */
const usageLedgerEntrySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    generationJob: {
      type: Schema.Types.ObjectId,
      ref: 'GenerationJob',
      required: true,
    },
    type: {
      type: String,
      enum: ['charge', 'refund'],
      required: true,
    },
    // Always 1 today (one generation = one quota unit) — kept as a field
    // rather than hardcoded so a future variable-cost model (e.g. cost
    // scaling with duration/resolution) doesn't need a schema migration.
    amount: {
      type: Number,
      required: true,
      default: 1,
    },
    // Denormalized from the subscription at charge time — lets
    // getMyUsage() query "this period's entries" directly without a join,
    // same reasoning the old Usage.model.js used periodStart for.
    periodStart: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      required: true, // e.g. 'job_submitted', 'job_failed', 'job_cancelled'
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // no updatedAt — these never update
  }
);

usageLedgerEntrySchema.index({ generationJob: 1, type: 1 }, { unique: true });
usageLedgerEntrySchema.index({ user: 1, periodStart: 1 });

export const UsageLedgerEntry = model('UsageLedgerEntry', usageLedgerEntrySchema);
