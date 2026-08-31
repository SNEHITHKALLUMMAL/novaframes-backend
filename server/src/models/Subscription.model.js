import mongoose from 'mongoose';
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUS } from '../constants/enums.js';

const { Schema, model } = mongoose;

const subscriptionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // one subscription record per user (current state; history via Payment)
    },
    plan: {
      type: String,
      enum: Object.values(SUBSCRIPTION_PLANS),
      default: SUBSCRIPTION_PLANS.FREE,
    },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.ACTIVE,
      index: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly',
    },
    currentPeriodStart: {
      type: Date,
      default: null,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    paymentProviderCustomerId: {
      type: String,
      default: null,
    },
    paymentProviderSubscriptionId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export const Subscription = model('Subscription', subscriptionSchema);
