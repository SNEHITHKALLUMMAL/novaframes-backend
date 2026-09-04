import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const modelVersionSchema = new Schema(
  {
    aiModel: {
      type: Schema.Types.ObjectId,
      ref: 'AIModel',
      required: true,
      index: true,
    },
    version: {
      type: String,
      required: true,
      trim: true,
    },
    releaseNotes: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

modelVersionSchema.index({ aiModel: 1, version: 1 }, { unique: true });

export const ModelVersion = model('ModelVersion', modelVersionSchema);
