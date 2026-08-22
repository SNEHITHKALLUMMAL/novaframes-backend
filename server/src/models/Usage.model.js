import mongoose from 'mongoose';

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
