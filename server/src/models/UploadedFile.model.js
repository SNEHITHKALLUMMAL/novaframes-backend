import mongoose from 'mongoose';
import { UPLOADED_FILE_PURPOSE } from '../constants/enums.js';

const { Schema, model } = mongoose;

const uploadedFileSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: Object.values(UPLOADED_FILE_PURPOSE),
      default: UPLOADED_FILE_PURPOSE.GENERATION_INPUT,
    },
    originalName: {
      type: String,
      required: true,
      // Stored for display only — never used to construct a filesystem path.
      // The actual storage key is always server-generated (see storageKey).
    },
    storageKey: {
      type: String,
      required: true,
      unique: true, // server-generated key/path from the StorageProvider abstraction
    },
    mimeType: {
      type: String,
      required: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
    },
    checksum: {
      type: String,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
      // e.g. { width, height, format } for images — populated by the
      // service that actually inspects the file's real bytes, never
      // trusted from what the client claims.
    },
  },
  { timestamps: true }
);

uploadedFileSchema.index({ owner: 1, createdAt: -1 });

export const UploadedFile = model('UploadedFile', uploadedFileSchema);
