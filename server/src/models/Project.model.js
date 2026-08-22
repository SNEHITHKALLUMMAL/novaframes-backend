import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const projectSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Videos reference their project (Video.project) rather than Project holding
// an array of video IDs — keeps this document small regardless of library size
// and avoids unbounded array growth on a single Project document.
projectSchema.index({ owner: 1, createdAt: -1 });

export const Project = model('Project', projectSchema);
