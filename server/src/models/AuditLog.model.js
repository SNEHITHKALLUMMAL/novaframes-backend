import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const auditLogSchema = new Schema(
  {
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true, // e.g. 'user.role_changed', 'ai_model.disabled', 'subscription.cancelled'
    },
    targetType: {
      type: String,
      default: null, // e.g. 'User', 'AIModel', 'GenerationJob'
    },
    targetId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } } // audit entries are immutable
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });
// The admin audit log view (Phase 19) lists all entries globally, sorted
// by recency, with no actor filter — needs its own index for that sort.
auditLogSchema.index({ createdAt: -1 });

export const AuditLog = model('AuditLog', auditLogSchema);
