import mongoose from 'mongoose';
import { GENERATION_TYPES, VIDEO_STATUS } from '../constants/enums.js';

const { Schema, model } = mongoose;

const videoSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    generationJob: {
      type: Schema.Types.ObjectId,
      ref: 'GenerationJob',
      required: true,
    },
    aiModel: {
      type: Schema.Types.ObjectId,
      ref: 'AIModel',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(GENERATION_TYPES),
      required: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 150,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(VIDEO_STATUS),
      default: VIDEO_STATUS.PROCESSING,
      index: true,
    },
    fileUrl: {
      type: String,
      default: null, // set once StorageProvider persists the output
    },
    fileKey: {
      type: String,
      default: null, // raw StorageProvider key — needed to actually delete the
      // file later; fileUrl alone isn't reliably reversible for every
      // storage backend (e.g. a signed cloud URL), so this is stored
      // separately rather than derived from the URL at delete time.
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    thumbnailKey: {
      type: String,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: null,
    },
    resolution: {
      type: String,
      default: null,
    },
    fileSizeBytes: {
      type: Number,
      default: null,
    },
    format: {
      type: String,
      default: 'mp4',
    },
    prompt: {
      type: String,
      default: '',
    },
    negativePrompt: {
      type: String,
      default: '',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

videoSchema.index({ owner: 1, createdAt: -1 });
videoSchema.index({ owner: 1, project: 1 });
videoSchema.index({ title: 'text', prompt: 'text' }); // supports library search

export const Video = model('Video', videoSchema);
