import mongoose from 'mongoose';
import { NOTIFICATION_TYPES } from '../constants/enums.js';

const { Schema, model } = mongoose;

const notificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      default: '',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    relatedJob: {
      type: Schema.Types.ObjectId,
      ref: 'GenerationJob',
      default: null,
    },
    relatedVideo: {
      type: Schema.Types.ObjectId,
      ref: 'Video',
      default: null,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

export const Notification = model('Notification', notificationSchema);
