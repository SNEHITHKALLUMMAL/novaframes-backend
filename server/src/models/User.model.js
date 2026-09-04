import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { USER_ROLES } from '../constants/enums.js';

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // never returned by default — satisfies "never expose passwords through APIs"
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.USER,
      index: true,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true, // soft-disable flag; hard delete is a separate service-level operation
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false, // internal security bookkeeping, never returned in API responses
    },
    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      // Incremented on password change / explicit "logout everywhere" so
      // previously issued refresh tokens can be invalidated without needing
      // a server-side session store. Complements, doesn't replace, the
      // per-device Session model (PHASE_03) — this handles bulk
      // invalidation, Session handles individual device revocation.
    },
    emailVerified: {
      type: Boolean,
      default: false,
      // Non-blocking today — see auth.service.js's email-verification
      // section comment. Tracked so a future phase can decide to gate
      // specific features on it without a schema change.
    },
    passwordResetTokenHash: {
      type: String,
      default: null,
      select: false, // never returned in API responses
    },
    passwordResetExpires: {
      type: Date,
      default: null,
      select: false,
    },
    emailVerificationTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

// Hash password on create/change — the model guarantees plaintext never persists,
// regardless of which controller/service calls .save().
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) {
    this.passwordChangedAt = new Date();
    this.tokenVersion += 1; // invalidate any refresh tokens issued before this change
  }
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never leak the hash even if a document is accidentally serialized elsewhere.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

export const User = model('User', userSchema);
