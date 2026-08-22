import mongoose from 'mongoose';
import { PAYMENT_STATUS } from '../constants/enums.js';

const { Schema, model } = mongoose;

const paymentSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subscription: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
    },
    amount: {
      type: Number,
      required: true, // stored in the smallest currency unit (e.g. cents) to avoid float issues
    },
    currency: {
      type: String,
      default: 'USD',
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
      index: true,
    },
    provider: {
      type: String,
      required: true, // 'stripe' | 'razorpay' | 'dev-stub'
    },
    providerPaymentId: {
      type: String,
      default: null,
      index: true,
      // Never store raw card data here or anywhere — only the provider's
      // opaque reference ID, per SRS payment security rules.
    },
    invoiceUrl: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

paymentSchema.index({ user: 1, createdAt: -1 });

export const Payment = model('Payment', paymentSchema);
