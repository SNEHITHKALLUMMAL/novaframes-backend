import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * One document per issued refresh token, keyed by its `jti` claim (a
 * random UUID embedded in the refresh JWT at sign time — see
 * token.service.js). This is the "Session" model the SRS's
 * mandatory_data_models list requires; before this phase, sessions were
 * purely stateless JWTs with no per-device record, which meant:
 *  - "logout" only cleared cookies client-side — a stolen refresh token
 *    remained valid until it naturally expired or the user did a full
 *    password change (tokenVersion bump revokes ALL sessions at once,
 *    with no way to revoke just one).
 *  - No way to list active sessions/devices.
 *  - No refresh-token-reuse detection (a classic theft signal: if a
 *    refresh token that's already been rotated out gets presented again,
 *    that's someone using a copy of a token that should no longer exist).
 *
 * The jti itself is not a credential — knowing a jti alone doesn't
 * authenticate anything; the signed JWT is what proves possession. So
 * storing it directly (not hashed) is fine, same reasoning `Payment`
 * stores a provider's opaque reference ID directly.
 */
const sessionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    jti: {
      type: String,
      required: true,
      unique: true,
    },
    userAgent: {
      type: String,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
    // Set when this session is rotated out in favor of a new one (normal
    // refresh flow) — distinguishes "rotated" from "explicitly logged out"
    // from "revoked due to detected reuse" for audit purposes, even though
    // all three just set revokedAt for authorization purposes.
    replacedByJti: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export const Session = model('Session', sessionSchema);
