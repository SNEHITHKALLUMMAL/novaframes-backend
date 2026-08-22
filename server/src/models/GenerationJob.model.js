import mongoose from 'mongoose';
import { GENERATION_TYPES, JOB_STATUS } from '../constants/enums.js';

const { Schema, model } = mongoose;

const generationJobSchema = new Schema(
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
    },
    type: {
      type: String,
      enum: Object.values(GENERATION_TYPES),
      required: true,
    },
    prompt: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    negativePrompt: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    inputFiles: [
      {
        type: Schema.Types.ObjectId,
        ref: 'UploadedFile',
      },
    ],
    aiModel: {
      type: Schema.Types.ObjectId,
      ref: 'AIModel',
      required: true,
    },
    modelVersion: {
      type: Schema.Types.ObjectId,
      ref: 'ModelVersion',
      default: null,
    },
    parameters: {
      // resolution, durationSeconds, aspectRatio, seed, numOutputs, etc. —
      // shape varies per model's getCapabilities(), validated against the
      // selected AIModel's supported* fields at the service layer, not here.
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.PENDING,
      index: true,
    },
    progressPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    queuePosition: {
      type: Number,
      default: null,
    },
    workerId: {
      type: String,
      default: null,
    },
    bullJobId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    error: {
      message: { type: String, default: null },
      code: { type: String, default: null },
    },
    outputVideo: {
      type: Schema.Types.ObjectId,
      ref: 'Video',
      default: null,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

generationJobSchema.index({ owner: 1, status: 1, createdAt: -1 });
generationJobSchema.index({ owner: 1, createdAt: -1 });
// The two below support the admin job monitor (Phase 19), which queries
// across ALL users (no owner filter) — the owner-scoped indexes above
// can't serve those queries efficiently.
generationJobSchema.index({ status: 1, createdAt: -1 });
generationJobSchema.index({ createdAt: -1 });

export const GenerationJob = model('GenerationJob', generationJobSchema);
