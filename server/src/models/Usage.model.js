import mongoose from 'mongoose';

/**
 * @deprecated Superseded by UsageLedgerEntry (PHASE_12) — this was a
 * mutable per-period counter ($inc'd directly), which couldn't support
 * refunds or per-event auditability and didn't satisfy the SRS's "never
 * rely only on a mutable balance field" rule. No code reads or writes
 * this model anymore; kept only so pre-existing data remains inspectable.
 * See usage.service.js and docs/CREDITS_LEDGER.md.
 */
const { Schema, model } = mongoose;

const usageSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    generationsCount: {
      type: Number,
      default: 0,
    },
    secondsGenerated: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// One usage document per user per billing period — services increment this
// atomically ($inc) rather than reading-modifying-writing, to stay correct
// under concurrent job completions.
usageSchema.index({ user: 1, periodStart: 1 }, { unique: true });

export const Usage = model('Usage', usageSchema);
