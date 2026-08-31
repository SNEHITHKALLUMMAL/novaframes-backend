import mongoose from 'mongoose';
import { GENERATION_TYPES } from '../constants/enums.js';

const { Schema, model } = mongoose;

const aiModelSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    provider: {
      type: String,
      trim: true,
      default: '',
    },
    modelId: {
      type: String,
      required: true,
      unique: true, // stable slug, e.g. "mock-dev-v1", "wan-2.1"
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    capabilities: {
      type: [String],
      enum: Object.values(GENERATION_TYPES),
      default: [],
      required: true,
    },
    supportedResolutions: {
      type: [String],
      default: ['1280x720'],
    },
    supportedDurationsSeconds: {
      type: [Number],
      default: [5],
    },
    vramRequirementGB: {
      type: Number,
      default: 0, // 0 for the dev mock adapter, which needs no GPU
    },
    license: {
      type: String,
      default: 'Unspecified — must be verified before enabling in production',
    },
    commercialUseAllowed: {
      type: Boolean,
      default: false, // never assume; must be explicitly verified and set
    },
    isEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    adapterKey: {
      type: String,
      required: true, // maps to the ai-worker's adapter registry, e.g. 'mock', 'wan'
      trim: true,
    },
    config: {
      type: Schema.Types.Mixed,
      default: {},
      // Adapter-specific configuration only — never shell commands or raw
      // paths that could be interpreted as executable input (SRS security rule:
      // "Never allow arbitrary users to execute system commands through model configuration").
    },
  },
  { timestamps: true }
);

export const AIModel = model('AIModel', aiModelSchema);
